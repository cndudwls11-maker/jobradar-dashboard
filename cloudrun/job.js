const endpoint = process.env.JOBRADAR_SCHEDULED_COLLECTION_URL;
const token = process.env.JOBRADAR_SCHEDULER_TOKEN;

if (!endpoint || !token) {
  console.error('JOBRADAR_SCHEDULED_COLLECTION_URL and JOBRADAR_SCHEDULER_TOKEN are required.');
  process.exit(2);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 25_000);

try {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source: 'cloud-scheduler' }),
    signal: controller.signal,
  });
  const body = await response.json().catch(() => ({}));
  console.log(JSON.stringify({ status: response.status, result: body }));
  if (!response.ok || body.status === 'failed') process.exitCode = 1;
} catch (error) {
  console.error(`Scheduled JobRadar call failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}