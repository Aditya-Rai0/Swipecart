import express from 'express';
import cors from "cors";
import cookieParser from 'cookie-parser';

import { errorMiddleware} from '../../../packages/error-handler/error-middleware'; 

import { NotFoundError } from '../../../packages/error-handler';
import router from './routes/auth.router';
import swaggerUi from 'swagger-ui-express';

const swaggerDocument = require("./swagger-output.json");
// const host = process.env.HOST ?? 'localhost';
// const port = process.env.PORT ? Number(process.env.PORT) : 6002;

const app = express();
app.use(express.json());
app.use(cookieParser());


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

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get("/docs-json", (req,res) => {
    res.json(swaggerDocument);
});
// Routes

app.use("/api", router)

app.use('*', (req, res, next) => {
  next(new NotFoundError(`Route ${req.originalUrl} not found`));
});
app.use(errorMiddleware);

const port = process.env.PORT || 6002;
const server = app.listen(port,() => {
    console.log(`Auth service running al http://localhost:${port}/api`)
    console.log(`Swagger Docs available at http://localhost:${port}/docs`)
});

server.on("error", (err) => {
  console.log("Server Error:", err);
  console.log
})
