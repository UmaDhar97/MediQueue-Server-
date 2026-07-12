MediQueue — Server

Backend REST API for MediQueue, a tutor booking platform where students can browse tutors, book online learning sessions, and manage their bookings.

Live API:  https://mediqueue-client-sable.vercel.app

Client Repository: https://github.com/UmaDhar97/mediqueue-client

✨ Key Features

🔐 JWT-based authentication middleware protecting all private routes (add/update/delete tutor, view/cancel bookings).

🔍 Tutor search by name using MongoDB $regex (case-insensitive) and date-range filtering with $gte / $lte.

📅 Automatic slot management — booking a session decreases totalSlot by 1, and blocks bookings once slots run out or before the tutor's session start date.

🧑‍🏫 Full CRUD for tutors (Create, Read, Update, Delete) scoped to the logged-in user for private operations.

📖 Booking cancellation via PATCH, updating status to "cancelled" instead of deleting the record.


🛠️ Tech Stack
Runtime: Node.js, Express
Database: MongoDB (native driver)
Auth: JSON Web Token (jsonwebtoken)
Middleware: CORS, cookie-parser, dotenv
