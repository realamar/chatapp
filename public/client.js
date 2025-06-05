const socket = io();
const roomId = window.location.pathname.split("/").pop();

// Video call elements
const videoCallButton = document.querySelector(".video-call-button");
const videoContainer = document.getElementById("videoContainer");
const videoOverlay = document.getElementById("videoOverlay");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

// Voice call elements
const voiceCallButton = document.querySelector(".voice-call-button");

// WebRTC variables
let localStream = null;
let peerConnection = null;
let isInCall = false;
let isInVoiceCall = false;
let remoteAudioElement = null;

// WebRTC configuration (using Google's public STUN servers)
const configuration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

// Check for browser support
function checkBrowserSupport() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Your browser doesn't support video calls. Please use a modern browser.");
        return false;
    }
    return true;
}

// Initialize video call
async function toggleVideoCall() {
    if (!checkBrowserSupport()) return;

    if (!isInCall) {
        try {
            // Get user media
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            localVideo.srcObject = localStream;

            // Create peer connection
            createPeerConnection();

            // Show video container
            videoContainer.classList.add("active");
            videoOverlay.classList.add("active");
            videoCallButton.classList.add("active");
            isInCall = true;

            // Notify others in the room
            socket.emit("video-call-start");

            // Create and send offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit("video-offer", offer);
        } catch (error) {
            console.error("Error starting video call:", error);
            alert("Could not access camera/microphone. Please check permissions.");
            cleanupVideoCall();
        }
    } else {
        endVideoCall();
    }
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    // Add local stream
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice-candidate", event.candidate);
        }
    };

    // Handle incoming stream
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "disconnected" ||
            peerConnection.connectionState === "failed" ||
            peerConnection.connectionState === "closed") {
            endVideoCall();
        }
    };
}

function endVideoCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    videoContainer.classList.remove("active");
    videoOverlay.classList.remove("active");
    videoCallButton.classList.remove("active");
    isInCall = false;

    socket.emit("video-call-end");
}

// WebRTC signaling handlers
socket.on("video-offer", async ({ offer, from }) => {
    if (!isInCall && checkBrowserSupport()) {
        try {
            // Get user media if not already in call
            if (!localStream) {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true
                });
                localVideo.srcObject = localStream;
            }

            // Create peer connection
            createPeerConnection();

            // Show video container
            videoContainer.classList.add("active");
            videoOverlay.classList.add("active");
            videoCallButton.classList.add("active");
            isInCall = true;

            // Set remote description and create answer
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit("video-answer", answer);
        } catch (error) {
            console.error("Error handling video offer:", error);
            cleanupVideoCall();
        }
    }
});

socket.on("video-answer", async ({ answer }) => {
    if (peerConnection && peerConnection.signalingState === "have-local-offer") {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
            console.error("Error handling video answer:", error);
            cleanupVideoCall();
        }
    }
});

socket.on("ice-candidate", async ({ candidate }) => {
    if (peerConnection && peerConnection.remoteDescription) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error("Error adding ICE candidate:", error);
        }
    }
});

socket.on("video-call-left", () => {
    if (isInCall) {
        endVideoCall();
    }
});

// Cleanup function
function cleanupVideoCall() {
    endVideoCall();
    alert("Video call ended unexpectedly.");
}

// Handle page unload
window.addEventListener("beforeunload", () => {
    if (isInCall) {
        endVideoCall();
    }
});

socket.emit("join-room", roomId);

const input = document.getElementById("input");
const messages = document.getElementById("messages");
const copySuccess = document.querySelector(".copy-success");
const fileInput = document.getElementById("file-input");
const uploadButton = document.getElementById("upload-button");

let selectedFile = null;

// Handle Enter key press
input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        sendMessage();
    }
});

// Handle file selection
fileInput.addEventListener("change", (e) => {
    selectedFile = e.target.files[0];
    if (selectedFile) {
        uploadButton.classList.add("visible");
    } else {
        uploadButton.classList.remove("visible");
    }
});

function sendMessage() {
    const msg = input.value.trim();
    if (msg) {
        socket.emit("chat-message", msg);
        input.value = "";
    }
}

async function uploadImage() {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append("image", selectedFile);

    try {
        const response = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            throw new Error("Upload failed");
        }

        const data = await response.json();
        socket.emit("chat-message", data.url);
        
        // Reset file input
        fileInput.value = "";
        selectedFile = null;
        uploadButton.classList.remove("visible");
    } catch (error) {
        console.error("Error uploading file:", error);
        alert("Failed to upload image. Please try again.");
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

function isImageUrl(url) {
    return /\.(jpg|jpeg|png|gif)$/i.test(url);
}

function createDownloadButton(url) {
    const button = document.createElement("button");
    button.className = "download-button";
    button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Download
    `;
    button.onclick = () => window.open(url, "_blank");
    return button;
}

socket.on("chat-message", (msg) => {
    const div = document.createElement("div");
    const isCurrentUser = msg.startsWith("You: ");
    div.className = `message ${isCurrentUser ? "sent" : "received"}`;
    
    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";
    
    if (isCurrentUser) {
        msg = msg.substring(5);
    }
    
    if (isImageUrl(msg)) {
        const img = document.createElement("img");
        img.src = msg;
        img.alt = "Shared image";
        contentDiv.appendChild(img);
        contentDiv.appendChild(createDownloadButton(msg));
    } else {
        contentDiv.textContent = msg;
    }
    
    div.appendChild(contentDiv);
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
});

// Initialize voice call
async function toggleVoiceCall() {
    if (!checkBrowserSupport()) return;

    if (!isInVoiceCall) {
        try {
            // Get user media (audio only)
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });

            // Create peer connection
            createVoicePeerConnection();

            // Update UI
            voiceCallButton.classList.add("active");
            isInVoiceCall = true;

            // Notify others in the room
            socket.emit("voice-call-start");

            // Create and send offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit("voice-offer", offer);
        } catch (error) {
            console.error("Error starting voice call:", error);
            alert("Could not access microphone. Please check permissions.");
            cleanupVoiceCall();
        }
    } else {
        endVoiceCall();
    }
}

function createVoicePeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    // Add local stream
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("voice-ice-candidate", event.candidate);
        }
    };

    // Handle incoming stream
    peerConnection.ontrack = (event) => {
        if (!remoteAudioElement) {
            remoteAudioElement = document.createElement("audio");
            remoteAudioElement.autoplay = true;
            remoteAudioElement.style.display = "none";
            document.body.appendChild(remoteAudioElement);
        }
        remoteAudioElement.srcObject = event.streams[0];
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "disconnected" ||
            peerConnection.connectionState === "failed" ||
            peerConnection.connectionState === "closed") {
            endVoiceCall();
        }
    };
}

function endVoiceCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    if (remoteAudioElement) {
        remoteAudioElement.srcObject = null;
        remoteAudioElement.remove();
        remoteAudioElement = null;
    }

    voiceCallButton.classList.remove("active");
    isInVoiceCall = false;

    socket.emit("voice-call-end");
}

// Voice call signaling handlers
socket.on("voice-offer", async ({ offer, from }) => {
    if (!isInVoiceCall && checkBrowserSupport()) {
        try {
            // Get user media if not already in call
            if (!localStream) {
                localStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: false
                });
            }

            // Create peer connection
            createVoicePeerConnection();

            // Update UI
            voiceCallButton.classList.add("active");
            isInVoiceCall = true;

            // Set remote description and create answer
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit("voice-answer", answer);
        } catch (error) {
            console.error("Error handling voice offer:", error);
            cleanupVoiceCall();
        }
    }
});

socket.on("voice-answer", async ({ answer }) => {
    if (peerConnection && peerConnection.signalingState === "have-local-offer") {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
            console.error("Error handling voice answer:", error);
            cleanupVoiceCall();
        }
    }
});

socket.on("voice-ice-candidate", async ({ candidate }) => {
    if (peerConnection && peerConnection.remoteDescription) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error("Error adding ICE candidate:", error);
        }
    }
});

socket.on("voice-call-left", () => {
    if (isInVoiceCall) {
        endVoiceCall();
    }
});

// Cleanup function for voice calls
function cleanupVoiceCall() {
    endVoiceCall();
    alert("Voice call ended unexpectedly.");
}

// Handle page unload
window.addEventListener("beforeunload", () => {
    if (isInVoiceCall) {
        endVoiceCall();
    }
    if (isInCall) {
        endVideoCall();
    }
});
