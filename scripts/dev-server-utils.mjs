import net from 'node:net';

function checkPort(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

export async function resolvePort(requestedPort, host = '127.0.0.1') {
  let port = requestedPort;

  while (!(await checkPort(host, port))) {
    port += 1;
  }

  return port;
}
