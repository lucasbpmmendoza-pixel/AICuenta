export async function logAction(button: string) {
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ button }),
    })
  } catch (err) {
    console.error('Failed to log action:', err)
  }
}
