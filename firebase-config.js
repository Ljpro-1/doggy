import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getDatabase,
  ref,
  set,
  push,
  onValue,
  remove,
  update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyArMoB5RAf78LgHNv3ZMyn__0nAqfGjdU4",
    authDomain: "europa-96bcf.firebaseapp.com",
    databaseURL: "https://europa-96bcf-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "europa-96bcf",
    storageBucket: "europa-96bcf.firebasestorage.app",
    messagingSenderId: "351107242971",
    appId: "1:351107242971:web:9b550885152eea8091e5fe"
  };



const app = initializeApp(firebaseConfig);

const database = getDatabase(app);

export {
  database,
  ref,
  set,
  push,
  onValue,
  remove,
  update
};
