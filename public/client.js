const socket = io();
const roomId = window.location.pathname.split("/").pop();

socket.emit("join-room", roomId);

const input = document.getElementById("input");
const messages = document.getElementById("messages");
const copySuccess = document.querySelector(".copy-success");

// Handle Enter key press
input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        sendMessage();
    }
});

function sendMessage() {
    const msg = input.value.trim();
    if (msg) {
        socket.emit("chat-message", msg);
        input.value = "";
    }
}

function copyRoomLink() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        copySuccess.classList.add("visible");
        setTimeout(() => {
            copySuccess.classList.remove("visible");
        }, 2000);
    });
}

socket.on("chat-message", (msg) => {
    const div = document.createElement("div");
    div.textContent = msg;
    
    // Determine if the message is from the current user
    const isCurrentUser = msg.startsWith("You: ");
    div.className = `message ${isCurrentUser ? "sent" : "received"}`;
    
    // Remove "You: " prefix for sent messages
    if (isCurrentUser) {
        div.textContent = msg.substring(5);
    }
    
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
});
