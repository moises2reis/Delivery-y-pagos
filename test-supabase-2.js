import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://htxzsefmejercvwlarfl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0eHpzZWZtZWplcmN2d2xhcmZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMzE2NjIsImV4cCI6MjEwNDgwNzY2Mn0.oxjaY99j5dvFWfOPiXSVCigc1MKKLxTXMjNB1m_IxVw'
);

async function test() {
  const { data, error } = await supabase.functions.invoke('swift-handler', {
    body: { action: 'recent_transactions' },
  });
  console.log(data, error);
}
test();
