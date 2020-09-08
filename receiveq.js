let ampq = require("amqplib").connect("amqp://localhost");
let q = "tasks";

ampq
  .then((conn) => {
    return conn.createChannel();
  })
  .then((ch) => {
    return ch.assertQueue(q).then((ok) => {
      return ch.consume(q, (msg) => {
        if (msg !== null) {
          console.log(`message receivced: ${msg.content.toString()}`);
          ch.ack(msg);
        }
      });
    });
  })
  .catch(console.warn);
