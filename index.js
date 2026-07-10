const dotenv = require("dotenv");
dotenv.config();

const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:4173",
      "https://mediqueue-client-xmdv-n2b4zsy03-umadhar97s-projects.vercel.app",
      /\.vercel\.app$/,
    ],
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// verify JWT sent from client
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader) return res.status(401).send({ message: "unauthorized access" });
  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).send({ message: "unauthorized access" });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).send({ message: "unauthorized access" });
    req.decoded = decoded;
    next();
  });
};

// make sure the logged-in user is asking about their own data
const verifyEmail = (req, res, next) => {
  const queryEmail = req.query.email;
  if (queryEmail && req.decoded?.email !== queryEmail) {
    return res.status(403).send({ message: "forbidden access" });
  }
  next();
};

async function run() {
  try {
    await client.connect();
    console.log("MongoDB Connected");

    const tutorCollection = client.db("mediqueueDB").collection("tutors");
    const bookingCollection = client.db("mediqueueDB").collection("bookings");
    const userCollection = client.db("mediqueueDB").collection("users");

    // verify the logged-in user is an admin (checked against DB, not client input)
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded?.email;
      const user = await userCollection.findOne({ email });
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access: admin only" });
      }
      next();
    };

    // create/sync a user on register or google login (default role: student)
    app.post("/users", async (req, res) => {
      const user = req.body;
      const existing = await userCollection.findOne({ email: user.email });
      if (existing) {
        return res.send({ message: "user already exists", inserted: false });
      }
      const result = await userCollection.insertOne({
        ...user,
        role: "student",
        createdAt: new Date(),
      });
      res.send(result);
    });

    // check if a given email is admin
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const user = await userCollection.findOne({ email });
      res.send({ admin: user?.role === "admin" });
    });

    // admin dashboard stats
    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const totalUsers = await userCollection.estimatedDocumentCount();
      const totalTutors = await tutorCollection.estimatedDocumentCount();
      const totalBookings = await bookingCollection.estimatedDocumentCount();
      res.send({ totalUsers, totalTutors, totalBookings });
    });

    // admin: list all registered users
    app.get("/admin/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    // admin: list all booked sessions (who booked which tutor)
    app.get("/admin/bookings", verifyToken, verifyAdmin, async (req, res) => {
      const result = await bookingCollection.find().toArray();
      res.send(result);
    });

    // JWT
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "7d" });
      res.send({ token });
    });

    // GET all tutors -> supports search ($regex) & date filter ($gte/$lte)
    app.get("/tutors", async (req, res) => {
      const { search, startDate, endDate } = req.query;
      let query = {};

      if (search) {
        query.tutorName = { $regex: search, $options: "i" };
      }

      if (startDate || endDate) {
        query.sessionDate = {};
        if (startDate) query.sessionDate.$gte = startDate;
        if (endDate) query.sessionDate.$lte = endDate;
      }

      const result = await tutorCollection.find(query).toArray();
      res.send(result);
    });

    // GET 6 tutors for home page ($limit)
    app.get("/homeTutors", async (req, res) => {
      const result = await tutorCollection.find().limit(6).toArray();
      res.send(result);
    });

    // GET tutors created by the logged-in user -> "My Tutors" page
    // (this route did not exist before, so /myTutors always 404'd)
    app.get("/myTutors", verifyToken, verifyEmail, async (req, res) => {
      const email = req.query.email;
      const result = await tutorCollection.find({ email }).toArray();
      res.send(result);
    });

    // GET single tutor by id
    app.get("/tutors/:id", async (req, res) => {
      const id = req.params.id;
      const result = await tutorCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // POST add tutor - admin only, so students can't create tutors
    app.post("/tutors", verifyToken, verifyAdmin, async (req, res) => {
      const tutor = req.body;
      const result = await tutorCollection.insertOne(tutor);
      res.send(result);
    });

    // PUT update tutor - admin only
    app.put("/tutors/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const result = await tutorCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );
      res.send(result);
    });

    // DELETE tutor - admin only
    app.delete("/tutors/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await tutorCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // POST booking
    app.post("/bookings", verifyToken, async (req, res) => {
      const booking = req.body;

      const tutor = await tutorCollection.findOne({
        _id: new ObjectId(booking.tutorId),
      });

      if (!tutor) {
        return res.status(404).send({ message: "Tutor not found" });
      }

      // Session Date Restriction: block booking before the tutor's start date
      if (tutor.sessionDate) {
        const today = new Date().setHours(0, 0, 0, 0);
        const sessionDate = new Date(tutor.sessionDate).setHours(0, 0, 0, 0);
        if (today < sessionDate) {
          return res
            .status(400)
            .send({ message: "Booking is not available yet for this tutor" });
        }
      }

      // Total Slot check
      if (!tutor.totalSlot || tutor.totalSlot <= 0) {
        return res.status(400).send({ message: "No available slots left." });
      }

      // Auto decrease slot
      await tutorCollection.updateOne(
        { _id: new ObjectId(booking.tutorId) },
        { $inc: { totalSlot: -1 } }
      );

      const result = await bookingCollection.insertOne(booking);
      res.send(result);
    });

    // GET bookings by email -> "My Booked Sessions" page
    app.get("/bookings", verifyToken, verifyEmail, async (req, res) => {
      const email = req.query.email;
      const result = await bookingCollection.find({ studentEmail: email }).toArray();
      res.send(result);
    });

    // PATCH cancel booking
    app.patch("/bookings/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await bookingCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "cancelled" } }
      );
      res.send(result);
    });

  } catch (err) {
    console.error(err);
  }
}

run();

app.get("/", (req, res) => res.send("MediQueue Server Running"));

app.listen(port, () => console.log(`Server running on ${port}`));