function withServer(app, callback) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", async () => {
      try {
        const address = server.address();
        await callback(`http://127.0.0.1:${address.port}`);
        server.close((error) => (error ? reject(error) : resolve()));
      } catch (error) {
        server.close(() => reject(error));
      }
    });
  });
}

export { withServer };
