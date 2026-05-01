import { createApp } from "./app";

const port: number = Number(process.env.PORT ?? 4174);

createApp().listen(port, "127.0.0.1", () => {
  console.log(`Trading journal API listening on http://127.0.0.1:${port}`);
});
