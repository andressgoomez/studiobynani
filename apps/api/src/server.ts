import { buildApp } from './app.js';

const app = buildApp();
const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: process.env.HOST ?? '127.0.0.1' })
  .then(() => console.log(`StudioByNani API escuchando en ${port}`))
  .catch((error) => {
    console.error('No se pudo iniciar la API:', error);
    process.exit(1);
  });
