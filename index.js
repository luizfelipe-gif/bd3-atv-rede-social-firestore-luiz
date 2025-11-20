const express = require('express');
const ejs = require('ejs');
const http = require('http');
const path = require('path');
const socketIO = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const admin = require('firebase-admin');

const serviceAccount = require('./web-chat_luiz-firebase.json'); 

app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'public'));
app.engine('html', ejs.renderFile)
app.use('/', (request, response) => {
   response.render('index.html');
});

admin.initializeApp({
   credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

let postagensArmazenadas = [];

function formatTimestamp(timestamp) {
   if (timestamp && timestamp.toDate) {
      return timestamp.toDate().toLocaleString('pt-BR');
   }

   return 'Data Indisponível';
}

db.collection('messages').get().then(snapshot => {
   snapshot.forEach(doc => {
      const postData = doc.data();

      postagensArmazenadas.push({
         id: doc.id,
         autor: postData.autor,
         titulo: postData.titulo,
         texto: postData.texto,
         data_hora: formatTimestamp(postData.timestamp)
      });
   });

   postagensArmazenadas.reverse();
})
.catch(error => console.log('ERRO:', error));

io.on('connection', socket => {
   console.log('ID de usuário conectado: ' + socket.id);
   
   socket.emit('previousMessage', postagensArmazenadas); // Evento para buscar mensagens anteriores
   
   socket.on('sendMessage', async data => { // Evento pra enviar novas mensagens
      try {
         const post = {
            autor: data.autor,
            titulo: data.titulo,
            texto: data.texto,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
         };
         
         const postIndex = await db.collection('messages').add(post); // Buscar mensagens com indexamento pra cada uma
         
         const postagemComId = {
            id: postIndex.id,
            autor: data.autor,
            titulo: data.titulo,
            texto: data.texto,
            data_hora: new Date().toLocaleString('pt-BR')
         };
         
         postagensArmazenadas.unshift(postagemComId); // Adiciona novas mensagens no início do array
         
         io.emit('receivedMessage', postagemComId);
         
      } catch (error) {
         console.log('ERRO: ' + error);
      }
   });
   
   socket.on('deleteMessage', async (postID) => { // Evento pra excluir mensagens
      try {
         await db.collection('messages').doc(postID).delete();
         console.log('Post excluído com ID:', postID);

         postagensArmazenadas = postagensArmazenadas.filter(post => post.id !== postID); // Remove do array do servidor
         io.emit('messageDeleted', postID); // Notifica clientes sobre a exclusão
      } catch (error) {
         console.error('Erro ao excluir mensagem:', error);
      }
   });
});

server.listen(3000, () => {
   console.log("Servidor rodando em - http://localhost:3000")
});