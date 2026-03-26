const firebaseConfig = {
  apiKey: "AIzaSyDPKe5QvQp9H791S73mgqCWqNAxZNNX2Y0",
  authDomain: "suivi-paiement.firebaseapp.com",
  projectId: "suivi-paiement",
  storageBucket: "suivi-paiement.firebasestorage.app",
  messagingSenderId: "620348002013",
  appId: "1:620348002013:web:92678db715f92e93ced534"
};

firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();