import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types';
import { config } from '../core/config';

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

  public async checkAvailability(tenantId: string, date: string, serviceId: string, employeeId?: string): Promise<string[]> {
    // Mock implementation - return some available slots
    return ["09:00", "10:00", "11:00", "13:00", "14:30", "15:30"];
  }

  public async bookAppointment(tenantId: string, customerPhone: string, startTime: string, serviceId: string, employeeId: string): Promise<any> {
    // Mock implementation - return success
    return {
      success: true,
      appointment_id: `apt_${Date.now()}`,
      message: `Afspraak geboekt voor ${startTime}`
    };
  }

  public async findTenantByPhoneNumber(phoneNumber: string): Promise<{ tenantId: string; tenantSettings: any } | null> {
    try {
      // First find the tenant from telnyx_numbers
      const { data: telnyxNumber, error: telnyxError } = await this.client
        .from('telnyx_numbers')
        .select('tenant_id')
        .eq('phone_number', phoneNumber)
        .single();

      if (telnyxError || !telnyxNumber || !telnyxNumber.tenant_id) {
        return null;
      }

      // Then get tenant settings
      const { data: settings, error: settingsError } = await this.client
        .from('tenant_settings')
        .select('*')
        .eq('tenant_id', telnyxNumber.tenant_id)
        .single();

      if (settingsError || !settings) {
        return null;
      }

      return {
        tenantId: telnyxNumber.tenant_id,
        tenantSettings: settings
      };
    } catch (error) {
      console.error('Error finding tenant by phone number:', error);
      return null;
    }
  }

  public async createCallLog(
    sessionId: string,
    tenantId: string,
    _fromNumber: string,
    _toNumber: string,
    _callControlId: string
  ): Promise<void> {
    try {
      await this.client.from('call_logs').insert({
        id: sessionId,
        tenant_id: tenantId,
        customer_id: _fromNumber, // Assuming customer phone as ID for now
        start_time: new Date().toISOString(),
        status: 'IN_PROGRESS'
      });
    } catch (error) {
      console.error('Error creating call log:', error);
      throw error;
    }
  }

  public async finalizeCallLog(
    sessionId: string,
    durationSeconds: number
  ): Promise<void> {
    try {
      const endTime = new Date().toISOString();

      await this.client
        .from('call_logs')
        .update({
          end_time: endTime,
          duration_seconds: durationSeconds,
          status: 'COMPLETED'
        })
        .eq('id', sessionId);
    } catch (error) {
      console.error('Error finalizing call log:', error);
      throw error;
    }
  }

  public async updateTenantBilling(
    tenantId: string,
    minutesUsed: number
  ): Promise<void> {
    try {
      // TODO: Implement billing update - table schema needs to be verified
      console.log(`Billing update: tenant ${tenantId}, minutes ${minutesUsed}`);
      // await this.client
      //   .from('tenant_billing_stats')
      //   .upsert({
      //     tenant_id: tenantId,
      //     total_minutes_used: minutesUsed,
      //     last_updated: new Date().toISOString()
      //   }, {
      //     onConflict: 'tenant_id'
      //   });
    } catch (error) {
      console.error('Error updating tenant billing:', error);
      throw error;
    }
  }

  public async logSystemEvent(
    tenantId: string,
    eventType: string,
    content: any,
    _correlationId?: string
  ): Promise<void> {
    try {
      // TODO: Fix schema mismatch for system_logs table
      console.log(`System log: ${eventType} for tenant ${tenantId}`, content);
      // await this.client.from('system_logs').insert({
      //   tenant_id: tenantId,
      //   event: eventType,
      //   message: JSON.stringify(content),
      //   session_id: correlationId || null,
      //   level: 'info',
      //   source: 'websocket',
      //   created_at: new Date().toISOString()
      // });
    } catch (error) {
      console.error('Error logging system event:', error);
      throw error;
    }
  }
}