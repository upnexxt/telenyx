const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ollrwbogmvmydgrmcnhn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbHJ3Ym9nbXZteWRncm1jbmhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc3MzM5MiwiZXhwIjoyMDg5MzQ5MzkyfQ._ItfEUxxG5q9IGexxIaJTyA7xD0bNDxuCLcv6IN3SY4'
);

(async () => {
  try {
    const { data, error } = await supabase
      .from('telnyx_numbers')
      .upsert({
        tenant_id: 'c37ecc35-3e81-4f7d-8131-69dfaa427143',
        phone_number: '+31850835904',
        connection_id: '2930212006164169924',
        status: 'ASSIGNED'
      }, { onConflict: 'phone_number' });

    if (error) {
      console.error('Error inserting phone number:', error);
      process.exit(1);
    }

    console.log('✓ Phone number +31850835904 added to daan tenant');

    // Verify
    const { data: verify } = await supabase
      .from('telnyx_numbers')
      .select('phone_number, connection_id, status')
      .eq('tenant_id', 'c37ecc35-3e81-4f7d-8131-69dfaa427143');

    console.log('\n✓ Verified numbers for daan tenant:');
    console.log(JSON.stringify(verify, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
