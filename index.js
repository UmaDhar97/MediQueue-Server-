const dotenv = require("dotenv");
dotenv.config();

const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const {
  MongoClient,
  ServerApiVersion,
  ObjectId,
} = require("mongodb");

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

/* =========================
   MONGODB URI
========================= */
const uri = process.env.MONGODB_URI;

/* =========================
   MONGO CLIENT
========================= */
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

/* =========================
   VERIFY TOKEN
========================= */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }

    req.decoded = decoded;
    next();
  });
};

/* =========================
   MAIN FUNCTION
========================= */
async function run() {
  try {
    await client.connect();
    console.log("MongoDB Connected");

    const tutorCollection = client.db("mediqueueDB").collection("tutors");
    const bookingCollection = client.db("mediqueueDB").collection("bookings");

    app.post("/jwt", (req, res) => {
      const user = req.body;

      const token = jwt.sign(user, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });

      res.send({ token });
    });

    app.get("/myTutors", verifyToken, async (req, res) => {
      const email = req.query.email;
      const result = await tutorCollection.find({ email }).toArray();
      res.send(result);
    });

    app.get("/homeTutors", async (req, res) => {
      const result = await tutorCollection.find().limit(6).toArray();
      res.send(result);
    });

    app.get("/tutors/:id", async (req, res) => {
      const id = req.params.id;
      const result = await tutorCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.post("/tutors", verifyToken, async (req, res) => {
      const tutor = req.body;
      const result = await tutorCollection.insertOne(tutor);
      res.send(result);
    });

    app.post("/bookings", verifyToken, async (req, res) => {
      const booking = req.body;

      const tutor = await tutorCollection.findOne({
        _id: new ObjectId(booking.tutorId),
      });

      if (tutor.totalSlot <= 0) {
        return res.send({ message: "No slot available" });
      }

      await tutorCollection.updateOne(
        { _id: new ObjectId(booking.tutorId) },
        { $inc: { totalSlot: -1 } }
      );

      const result = await bookingCollection.insertOne(booking);
      res.send(result);
    });

    app.get("/bookings", verifyToken, async (req, res) => {
      const email = req.query.email;

      const result = await bookingCollection
        .find({ studentEmail: email })
        .toArray();

      res.send(result);
    });

    app.patch("/bookings/:id", async (req, res) => {
      const id = req.params.id;

      const result = await bookingCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "cancelled" } }
      );

      res.send(result);
    });

    app.delete("/tutors/:id", async (req, res) => {
      const id = req.params.id;

      const result = await tutorCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });
  } catch (err) {
    console.error(err);
  }
}

run();

/* =========================
   ROOT
========================= */
app.get("/", (req, res) => {
  res.send("MediQueue Server Running");
});

/* =========================
   LISTEN
========================= */
app.listen(port, () => {
  console.log(`Server running on ${port}`);
});