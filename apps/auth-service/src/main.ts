import express from 'express';
import cors from "cors";

// const host = process.env.HOST ?? 'localhost';
// const port = process.env.PORT ? Number(process.env.PORT) : 6002;

const app = express();

app.use(
  cors(
    { 
      origin: 'http://localhost:3000',
      allowedHeaders: ["Authorization", "Content_Type"],
      credentials: true, 
    }
  )
);

app.get('/', (req, res) => {
    res.send({ 'message': 'Hello API'});
});

const port = process.env.PORT || 6002;
const server = app.listen(port,() => {
    console.log(`Auth service running al http://localhost:${port}/api`)
});

server.on("error", (err) => {
  console.log("Server Error:", err)
})
