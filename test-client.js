fetch('http://localhost:3000/api/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'recent_transactions' })
}).then(r => r.text()).then(console.log).catch(console.error);
