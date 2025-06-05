const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const multer = require("multer");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "public/uploads/");
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error("Only image files are allowed!"));
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Handle file upload
app.post("/upload", upload.single("image"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
});

app.get("/room/:room", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Track active video calls per room
const activeCalls = new Map();

// Track active voice calls per room
const activeVoiceCalls = new Map();

io.on("connection", (socket) => {
    let currentRoom = null;

    socket.on("join-room", (roomId) => {
        currentRoom = roomId;
        socket.join(roomId);
        
        // Handle chat messages
        socket.on("chat-message", (msg) => {
            io.to(roomId).emit("chat-message", msg);
        });

        // Handle video call signaling
        socket.on("video-offer", (offer) => {
            // Only broadcast to other users in the room
            socket.to(roomId).emit("video-offer", {
                offer,
                from: socket.id
            });
        });

        socket.on("video-answer", (answer) => {
            // Only broadcast to other users in the room
            socket.to(roomId).emit("video-answer", {
                answer,
                from: socket.id
            });
        });

        socket.on("ice-candidate", (candidate) => {
            // Only broadcast to other users in the room
            socket.to(roomId).emit("ice-candidate", {
                candidate,
                from: socket.id
            });
        });

        // Handle video call start/end
        socket.on("video-call-start", () => {
            if (!activeCalls.has(roomId)) {
                activeCalls.set(roomId, new Set());
            }
            activeCalls.get(roomId).add(socket.id);
            socket.to(roomId).emit("video-call-joined", socket.id);
        });

        socket.on("video-call-end", () => {
            if (activeCalls.has(roomId)) {
                activeCalls.get(roomId).delete(socket.id);
                if (activeCalls.get(roomId).size === 0) {
                    activeCalls.delete(roomId);
                }
            }
            socket.to(roomId).emit("video-call-left", socket.id);
        });

        // Handle voice call signaling
        socket.on("voice-offer", (offer) => {
            // Only broadcast to other users in the room
            socket.to(roomId).emit("voice-offer", {
                offer,
                from: socket.id
            });
        });

        socket.on("voice-answer", (answer) => {
            // Only broadcast to other users in the room
            socket.to(roomId).emit("voice-answer", {
                answer,
                from: socket.id
            });
        });

        socket.on("voice-ice-candidate", (candidate) => {
            // Only broadcast to other users in the room
            socket.to(roomId).emit("voice-ice-candidate", {
                candidate,
                from: socket.id
            });
        });

        // Handle voice call start/end
        socket.on("voice-call-start", () => {
            if (!activeVoiceCalls.has(roomId)) {
                activeVoiceCalls.set(roomId, new Set());
            }
            activeVoiceCalls.get(roomId).add(socket.id);
            socket.to(roomId).emit("voice-call-joined", socket.id);
        });

        socket.on("voice-call-end", () => {
            if (activeVoiceCalls.has(roomId)) {
                activeVoiceCalls.get(roomId).delete(socket.id);
                if (activeVoiceCalls.get(roomId).size === 0) {
                    activeVoiceCalls.delete(roomId);
                }
            }
            socket.to(roomId).emit("voice-call-left", socket.id);
        });
    });

    // Cleanup on disconnect
    socket.on("disconnect", () => {
        if (currentRoom) {
            // Cleanup video calls
            if (activeCalls.has(currentRoom)) {
                activeCalls.get(currentRoom).delete(socket.id);
                if (activeCalls.get(currentRoom).size === 0) {
                    activeCalls.delete(currentRoom);
                }
                socket.to(currentRoom).emit("video-call-left", socket.id);
            }
            
            // Cleanup voice calls
            if (activeVoiceCalls.has(currentRoom)) {
                activeVoiceCalls.get(currentRoom).delete(socket.id);
                if (activeVoiceCalls.get(currentRoom).size === 0) {
                    activeVoiceCalls.delete(currentRoom);
                }
                socket.to(currentRoom).emit("voice-call-left", socket.id);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
