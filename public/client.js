document.addEventListener("DOMContentLoaded", () => {
    const socket = io();
    const roomId = window.location.pathname.split("/").pop();

    // DOM Elements
    const videoCallButton = document.querySelector(".video-call-button");
    const voiceCallButton = document.querySelector(".voice-call-button");
    const videoContainer = document.getElementById("videoContainer");
    const videoOverlay = document.getElementById("videoOverlay");
    const localVideo = document.getElementById("localVideo");
    const remoteVideo = document.getElementById("remoteVideo");
    const input = document.getElementById("input");
    const messages = document.getElementById("messages");
    const copySuccess = document.querySelector(".copy-success");
    const fileInput = document.getElementById("file-input");
    const uploadButton = document.getElementById("upload-button");

    let localStream = null;
    let peerConnection = null;
    let isInCall = false;
    let isInVoiceCall = false;
    let remoteAudioElement = null;
    let selectedFile = null;

    const configuration = {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" }
        ]
    };

    function checkBrowserSupport() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Your browser doesn't support video/audio calls.");
            return false;
        }
        return true;
    }

    // Handle file selection
    fileInput.addEventListener("change", (e) => {
        selectedFile = e.target.files[0];
        if (selectedFile) {
            uploadButton.classList.add("visible");
        } else {
            uploadButton.classList.remove("visible");
        }
    });

    uploadButton.addEventListener("click", async () => {
        if (!selectedFile) return;
        const formData = new FormData();
        formData.append("image", selectedFile);

        try {
            const response = await fetch("/upload", { method: "POST", body: formData });
            if (!response.ok) throw new Error("Upload failed");

            const data = await response.json();
            socket.emit("chat-message", data.url);

            fileInput.value = "";
            selectedFile = null;
            uploadButton.classList.remove("visible");
        } catch (error) {
            console.error("Upload error:", error);
            alert("Image upload failed.");
        }
    });

    input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendMessage();
    });

    function sendMessage() {
        const msg = input.value.trim();
        if (msg) {
            socket.emit("chat-message", msg);
            input.value = "";
        }
    }

    socket.on("chat-message", (msg) => {
        const div = document.createElement("div");
        const isCurrentUser = msg.startsWith("You: ");
        div.className = `message ${isCurrentUser ? "sent" : "received"}`;

        const contentDiv = document.createElement("div");
        contentDiv.className = "message-content";

        if (isCurrentUser) msg = msg.substring(5);

        if (/\.(jpg|jpeg|png|gif)$/i.test(msg)) {
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

    function createDownloadButton(url) {
        const button = document.createElement("button");
        button.className = "download-button";
        button.innerHTML = `Download`;
        button.onclick = () => window.open(url, "_blank");
        return button;
    }

    // ----------------- Video Call -----------------
    videoCallButton.addEventListener("click", toggleVideoCall);

    async function toggleVideoCall() {
        if (!checkBrowserSupport()) return;

        if (!isInCall) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                localVideo.srcObject = localStream;

                createPeerConnection("video");

                videoContainer.classList.add("active");
                videoOverlay.classList.add("active");
                videoCallButton.classList.add("active");
                isInCall = true;

                socket.emit("video-call-start");

                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                socket.emit("video-offer", offer);
            } catch (error) {
                console.error("Video call error:", error);
                alert("Could not access camera/microphone.");
                endVideoCall();
            }
        } else {
            endVideoCall();
        }
    }

    function createPeerConnection(type) {
        peerConnection = new RTCPeerConnection(configuration);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit(type === "video" ? "ice-candidate" : "voice-ice-candidate", event.candidate);
            }
        };

        peerConnection.ontrack = (event) => {
            if (type === "video") {
                remoteVideo.srcObject = event.streams[0];
            } else {
                if (!remoteAudioElement) {
                    remoteAudioElement = document.createElement("audio");
                    remoteAudioElement.autoplay = true;
                    remoteAudioElement.style.display = "none";
                    document.body.appendChild(remoteAudioElement);
                }
                remoteAudioElement.srcObject = event.streams[0];
            }
        };

        peerConnection.onconnectionstatechange = () => {
            if (["disconnected", "failed", "closed"].includes(peerConnection.connectionState)) {
                type === "video" ? endVideoCall() : endVoiceCall();
            }
        };
    }

    function endVideoCall() {
        if (peerConnection) peerConnection.close();
        peerConnection = null;
        if (localStream) localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        localVideo.srcObject = null;
        remoteVideo.srcObject = null;

        videoContainer.classList.remove("active");
        videoOverlay.classList.remove("active");
        videoCallButton.classList.remove("active");
        isInCall = false;

        socket.emit("video-call-end");
    }

    socket.on("video-offer", async ({ offer }) => {
        if (!isInCall && checkBrowserSupport()) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                localVideo.srcObject = localStream;

                createPeerConnection("video");

                videoContainer.classList.add("active");
                videoOverlay.classList.add("active");
                videoCallButton.classList.add("active");
                isInCall = true;

                await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit("video-answer", answer);
            } catch (error) {
                console.error("Video offer error:", error);
                endVideoCall();
            }
        }
    });

    socket.on("video-answer", async ({ answer }) => {
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    });

    socket.on("ice-candidate", async ({ candidate }) => {
        if (peerConnection) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error("ICE candidate error:", error);
            }
        }
    });

    socket.on("video-call-left", endVideoCall);

    // ----------------- Voice Call -----------------
    voiceCallButton.addEventListener("click", toggleVoiceCall);

    async function toggleVoiceCall() {
        if (!checkBrowserSupport()) return;

        if (!isInVoiceCall) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                createPeerConnection("voice");
                voiceCallButton.classList.add("active");
                isInVoiceCall = true;

                socket.emit("voice-call-start");
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                socket.emit("voice-offer", offer);
            } catch (error) {
                console.error("Voice call error:", error);
                endVoiceCall();
            }
        } else {
            endVoiceCall();
        }
    }

    function endVoiceCall() {
        if (peerConnection) peerConnection.close();
        peerConnection = null;
        if (localStream) localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        if (remoteAudioElement) {
            remoteAudioElement.srcObject = null;
            remoteAudioElement.remove();
            remoteAudioElement = null;
        }

        voiceCallButton.classList.remove("active");
        isInVoiceCall = false;

        socket.emit("voice-call-end");
    }

    socket.on("voice-offer", async ({ offer }) => {
        if (!isInVoiceCall && checkBrowserSupport()) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                createPeerConnection("voice");
                voiceCallButton.classList.add("active");
                isInVoiceCall = true;

                await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit("voice-answer", answer);
            } catch (error) {
                console.error("Voice offer error:", error);
                endVoiceCall();
            }
        }
    });

    socket.on("voice-answer", async ({ answer }) => {
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    });

    socket.on("voice-ice-candidate", async ({ candidate }) => {
        if (peerConnection) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.error("Failed to add ICE Candidate:", err);
            }
        }
    });

    socket.on("voice-call-left", endVoiceCall);

    socket.emit("join-room", roomId);
});
