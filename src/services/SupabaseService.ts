import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types';
import { config } from '../core/config';
import { logger } from '../core/logger';
import type { TenantSettings } from '../types/schema';

interface BookingParams {
  customerPhone: string;
  startTime: string;
  serviceId: string;
  employeeId: string;
}

export class SupabaseService {
  private static instance: SupabaseService;
  private client: SupabaseClient<Database>;

  private constructor() {
    this.client = createClient<Database>(
      config.SUPABASE_URL,
      config.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }

  public static getInstance(): SupabaseService {
    if (!SupabaseService.instance) {
      SupabaseService.instance = new SupabaseService();
    }
    return SupabaseService.instance;
  }

  public getClient(): SupabaseClient<Database> {
    return this.client;
  }

  /**
   * Get tenant settings (including AI configuration)
   */
  public async getTenantSettings(tenantId: string): Promise<TenantSettings> {
    try {
      const { data, error } = await this.client
        .from('tenant_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .single();

      if (error) {
        logger.error({ tenantId, error: error.message }, 'Error fetching tenant settings');
        throw error;
      }

      if (!data) {
        logger.warn({ tenantId }, 'No tenant settings found, using defaults');
        return {
          tenant_id: tenantId,
          ai_name: 'Sophie',
          ai_voice: 'Aoede',
          ai_language: 'Nederlands',
          ai_tone: 'vriendelijk en professioneel',
          ai_temperature: 0.7,
          business_name: 'de salon',
          custom_instructions: ''
        } as TenantSettings;
      }

      return data;
    } catch (error) {
      logger.error({ tenantId, error: (error as Error).message }, 'Error in getTenantSettings');
      throw error;
    }
  }

  /**
   * Check availability using RPC call
   * Calls the get_available_slots function in Supabase
   */
  public async checkAvailability(
    tenantId: string,
    serviceId: string,
    date: string,
    employeeId?: string
  ): Promise<any[]> {
    try {
      const { data, error } = await this.client.rpc('get_available_slots', {
        p_tenant_id: tenantId,
        p_service_id: serviceId,
        p_date: date,
        p_employee_id: employeeId ?? (null as any)
      });

      if (error) {
        logger.error(
          { tenantId, serviceId, date, error: error.message },
          'Error checking availability via RPC'
        );
        throw error;
      }

      logger.info(
        { tenantId, serviceId, date, slots: data?.length ?? 0 },
        'Availability check successful'
      );

      return data || [];
    } catch (error) {
      logger.error(
        { tenantId, serviceId, date, error: (error as Error).message },
        'Error in checkAvailability'
      );
      throw error;
    }
  }

  /**
   * Book appointment using RPC call
   * Calls the book_appointment_atomic function in Supabase
   */
  public async bookAppointment(
    tenantId: string,
    params: BookingParams
  ): Promise<any> {
    try {
      const { data, error } = await this.client.rpc('book_appointment_atomic', {
        p_tenant_id: tenantId,
        p_customer_id: params.customerPhone,
        p_start_time: params.startTime,
        p_service_id: params.serviceId,
        p_employee_id: params.employeeId
      });

      if (error) {
        logger.error(
          { tenantId, phone: params.customerPhone, error: error.message },
          'Error booking appointment via RPC'
        );
        throw error;
      }

      logger.info(
        { tenantId, startTime: params.startTime },
        'Appointment booked successfully'
      );

      return data;
    } catch (error) {
      logger.error(
        { tenantId, error: (error as Error).message },
        'Error in bookAppointment'
      );
      throw error;
    }
  }

  /**
   * Find tenant by phone number (for inbound call routing)
   */
  public async findTenantByPhoneNumber(
    phoneNumber: string
  ): Promise<{ tenantId: string; tenantSettings: any } | null> {
    try {
      // First find the tenant from telnyx_numbers
      const { data: telnyxNumber, error: telnyxError } = await this.client
        .from('telnyx_numbers')
        .select('tenant_id')
        .eq('phone_number', phoneNumber)
        .single();

      if (telnyxError || !telnyxNumber || !telnyxNumber.tenant_id) {
        logger.warn({ phoneNumber }, 'Phone number not found in telnyx_numbers');
        return null;
      }

      // Then get tenant settings
      const { data: settings, error: settingsError } = await this.client
        .from('tenant_settings')
        .select('*')
        .eq('tenant_id', telnyxNumber.tenant_id)
        .single();

      if (settingsError || !settings) {
        logger.warn(
          { tenantId: telnyxNumber.tenant_id },
          'Tenant settings not found'
        );
        return null;
      }

      return {
        tenantId: telnyxNumber.tenant_id,
        tenantSettings: settings
      };
    } catch (error) {
      logger.error(
        { phoneNumber, error: (error as Error).message },
        'Error finding tenant by phone number'
      );
      return null;
    }
  }

  /**
   * Create call log entry
   */
  public async createCallLog(
    sessionId: string,
    tenantId: string,
    fromNumber: string,
    _toNumber: string,
    _callControlId: string
  ): Promise<void> {
    try {
      await this.client.from('call_logs').insert({
        id: sessionId,
        tenant_id: tenantId,
        customer_id: fromNumber,
        start_time: new Date().toISOString(),
        status: 'IN_PROGRESS'
      } as any);

      logger.info({ sessionId, tenantId }, 'Call log created');
    } catch (error) {
      logger.error(
        { sessionId, error: (error as Error).message },
        'Error creating call log'
      );
      throw error;
    }
  }

  /**
   * Finalize call log with duration
   */
  public async finalizeCallLog(
    sessionId: string,
    durationSeconds: number
  ): Promise<void> {
    try {
      const endTime = new Date().toISOString();

      const { error } = await this.client
        .from('call_logs')
        .update({
          end_time: endTime,
          duration_seconds: durationSeconds,
          status: 'COMPLETED'
        })
        .eq('id', sessionId);

      if (error) {
        logger.error(
          { sessionId, error: error.message },
          'Error updating call log'
        );
        throw error;
      }

      logger.info(
        { sessionId, durationSeconds },
        'Call log finalized'
      );
    } catch (error) {
      logger.error(
        { sessionId, error: (error as Error).message },
        'Error in finalizeCallLog'
      );
      throw error;
    }
  }

  /**
   * Insert call trace for monitoring and debugging
   * Maps to the call_traces table with step_type (not trace_type)
   */
  public async insertCallTrace(trace: {
    call_log_id: string;
    tenant_id: string;
    step_type: string;
    content?: any;
    created_at?: string;
  }): Promise<void> {
    try {
      const { error } = await this.client.from('call_traces').insert({
        call_log_id: trace.call_log_id,
        tenant_id: trace.tenant_id,
        step_type: trace.step_type as any,
        content: trace.content || {},
        created_at: trace.created_at || new Date().toISOString()
      } as any);

      if (error) {
        logger.error(
          { callLogId: trace.call_log_id, error: error.message },
          'Error inserting call trace'
        );
        return; // Don't throw - tracing failures shouldn't break the call
      }

      logger.debug(
        { callLogId: trace.call_log_id, stepType: trace.step_type },
        'Call trace inserted'
      );
    } catch (error) {
      logger.error(
        { error: (error as Error).message },
        'Error in insertCallTrace'
      );
      // Silently fail - tracing is non-critical
    }
  }

  /**
   * Update tenant billing statistics
   */
  public async updateTenantBilling(
    tenantId: string,
    minutesUsed: number
  ): Promise<void> {
    try {
      const now = new Date().toISOString();

      const { error } = await this.client
        .from('tenant_billing_stats')
        .upsert(
          {
            tenant_id: tenantId,
            used_minutes: minutesUsed,
            updated_at: now
          } as any,
          { onConflict: 'tenant_id' }
        );

      if (error) {
        logger.error(
          { tenantId, error: error.message },
          'Error updating billing stats'
        );
        throw error;
      }

      logger.info(
        { tenantId, minutesUsed },
        'Tenant billing stats updated'
      );
    } catch (error) {
      logger.error(
        { tenantId, error: (error as Error).message },
        'Error in updateTenantBilling'
      );
      throw error;
    }
  }

  /**
   * Log system event
   */
  public async logSystemEvent(
    tenantId: string,
    eventType: string,
    content: any,
    correlationId?: string
  ): Promise<void> {
    try {
      const { error } = await this.client.from('system_logs').insert({
        event: eventType,
        content: content || {},
        message: eventType,
        session_id: correlationId || null,
        level: 'info',
        source: 'websocket',
        created_at: new Date().toISOString()
      } as any);

      if (error) {
        logger.warn(
          { tenantId, error: error.message },
          'Error logging system event'
        );
        return; // Don't throw - logging failures shouldn't break the call
      }

      logger.debug(
        { tenantId, eventType, sessionId: correlationId },
        'System event logged'
      );
    } catch (error) {
      logger.error(
        { error: (error as Error).message },
        'Error in logSystemEvent'
      );
      // Silently fail - logging is non-critical
    }
  }
}
