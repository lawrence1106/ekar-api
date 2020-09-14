const amqp = require("amqplib");
const express = require("express");
const app = express();

const PORT = process.env.PORT || 8081;

app.get("/getUnits", async (req, res) => {
  res.json(await getMessage());
});

app.listen(PORT, () => {
  console.log(`SERVER HAS STARTED AT PORT ${PORT}`);
  setInterval(() => {
    getMessage();
  }, 5000);
});

let q = "getUnits";
const getMessage = async () => {
  try {
    const conn = await amqp.connect("amqp://localhost");
    let channel = await conn.createChannel();
    let result = await channel.assertQueue(q);
    await channel.consume(q, (msg) => {
      if (msg !== null) {
        let msgq = JSON.parse(msg.content.toString());
        console.log(msgq);
        channel.ack(msg);
      } else {
        console.warn();
      }
    });
  } catch (err) {
    console.error(err);
  }
};
