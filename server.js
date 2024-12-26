require('dotenv').config(); // Mengimpor dotenv untuk membaca file .env
console.log('DB_URI:', process.env.DB_URI);
console.log('PORT:', process.env.PORT);

const express = require('express');
const path = require('path');
const http = require('http');
const socketio = require('socket.io');
const mongoose = require('mongoose');
const bodyParser = require("body-parser");

const formatMessage = require('./utils/messages');
const { userJoin, getCurrentUser, userLeave, getRoomUsers } = require('./utils/users');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const botName = "Admin";

// MongoDB Connection
mongoose.set('strictQuery', false); // Menangani peringatan strictQuery
mongoose.connect(process.env.DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB Atlas');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Room Schema and Model
const roomSchema = new mongoose.Schema({
  roomName: String
});
const Room = mongoose.model('Room', roomSchema);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsers
app.use(bodyParser.urlencoded({ extended: true }));

// EJS engine
app.set('view engine', 'ejs');

// Routes
app.get("/", (req, res) => {
  Room.find((err, docs) => {
    if (err) {
      console.log(err);
    } else {
      res.render("home", { rooms: docs });
    }
  });
});

app.get("/chat", (req, res) => {
  res.render("chat");
});

app.get("/admin", (req, res) => {
  Room.find((err, docs) => {
    if (err) {
      console.log(err);
    } else {
      res.render("admin", { rooms: docs });
    }
  });
});

app.post("/addRoom", (req, res) => {
  const room = new Room({
    roomName: req.body.newRoom
  });

  room.save(err => {
    if (err) {
      console.log(err);
    } else {
      res.redirect("/");
    }
  });
});

app.post("/delete", (req, res) => {
  const checkedRoomId = req.body.checkbox;

  Room.deleteOne({ _id: checkedRoomId }, err => {
    if (err) {
      console.log(err);
    } else {
      console.log("Successfully deleted checked room.");
      res.redirect("/admin");
    }
  });
});

app.post("/deleteAll", (req, res) => {
  Room.deleteMany({}, err => {
    if (err) {
      console.log(err);
    } else {
      console.log("Successfully deleted all rooms.");
      res.redirect("/admin");
    }
  });
});

// Socket.io Events
io.on('connection', socket => {
  socket.on('joinRoom', ({ username, room }) => {
    const user = userJoin(socket.id, username, room);

    socket.join(user.room);

    // Welcome current user
    socket.emit('message', formatMessage(botName, 'Welcome to HackChat'));

    // Broadcast when a user connects
    socket.broadcast.to(user.room).emit('message', formatMessage(botName, `${user.username} has joined the chat`));

    // Send users and room info
    io.to(user.room).emit('roomUsers', {
      room: user.room,
      users: getRoomUsers(user.room)
    });
  });

  // Listen for chatMessage
  socket.on('chatMessage', msg => {
    const user = getCurrentUser(socket.id);
    io.to(user.room).emit('message', formatMessage(user.username, msg));
  });

  // Runs when client disconnects
  socket.on('disconnect', () => {
    const user = userLeave(socket.id);

    if (user) {
      io.to(user.room).emit('message', formatMessage(botName, `${user.username} has left the chat`));

      // Send users and room info
      io.to(user.room).emit('roomUsers', {
        room: user.room,
        users: getRoomUsers(user.room)
      });
    }
  });
});

// Start server
let PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`Server has started successfully at ${PORT}`));
