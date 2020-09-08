const ampq = require("amqplib").connect("amqp://localhost");
let q = "getUnits";
let msgObj = [
  {
    device_id: "867459040868176",
    gps_latitude: 55.5668983459,
    gps_longitude: 24.2209510803,
    gps_signal: 12,
    mileage: 98139,
    fuel_level: 103.83116883126002,
    direction: 332,
    wheelbased_speed: 96,
    recorded_at: 1599559396,
  },
];
ampq
  .then((conn) => {
    return conn.createChannel();
  })
  .then((ch) => {
    return ch.assertQueue(q).then((ok) => {
      return ch.sendToQueue(q, Buffer.from(JSON.stringify(msgObj)));
    });
  })
  .catch(console.warn);
