const Net = require("net");
const { json } = require("body-parser");
const port = 8080;

const server = new Net.Server();
server.listen(port, function () {
  console.log(
    `Server listening for connection requests on socket localhost:${port}`
  );
});

server.on("connection", function (socket) {
  console.log("A new connection has been established.");

  socket.write("Hello, client.");

  // The server can also receive data from the client by reading from its socket.
  socket.on("data", function (chunk) {
    let bufferOne = Buffer.from(chunk);
    console.log(bufferOne.toString("ascii"));
    // let jsonBuffer = JSON.stringify(bufferOne);
    // let json = JSON.parse(jsonBuffer);
    // let array = [];
    // json.data.map((byte) => {
    //   array.push(String.fromCharCode(byte));
    // });
    // console.log(array.join(""));
  });

  // When the client requests to end the TCP connection with the server, the server
  // ends the connection.
  socket.on("end", function () {
    console.log("Closing connection with the client");
  });

  // Don't forget to catch error, for your own sake.
  socket.on("error", function (err) {
    console.log(`Error: ${err}`);
  });
});
