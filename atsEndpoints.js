require("dotenv").config();
const express = require("express");
const app = express();
const amqp = require("amqplib");
const bodyParser = require("body-parser");
app.use(bodyParser.json());

const token = process.env.WIALON_TOKEN;
const appKey = process.env.APP_KEY;

let liveTelematicsData = {};

const host = "https://hst-api.wialon.com/wialon/ajax.html?svc=token/login";

app.post("/services/ekar/getUnits", isAuth, (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json(liveTelematicsData);
});

app.post("/services/ekar/commands", isAuth, async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  let device_id = req.body.device_id;
  let command_key = req.body.command_key;
  if (
    command_key !== "Lock" &&
    command_key !== "lock" &&
    command_key !== "Unlock" &&
    command_key !== "unlock" &&
    command_key !== "Block" &&
    command_key !== "block" &&
    command_key !== "Unblock" &&
    command_key !== "unblock"
  )
    return res.sendStatus(400);
  await sentQ(device_id, command_key);
  console.log(`COMMAND SENT TO QUEUE! ${Date()}`);
});

app.post("/services/ekar/getUnitInterval", isAuth, async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  let device_id = req.body.device_id;
  let start_time = req.body.start_time;
  let end_time = req.body.end_time;

  let formData = new FormData();
  formData.append("params", JSON.stringify({ token: token }));

  await axios
    .post(host, formData, { headers: formData.getHeaders() })
    .then(async (response) => {
      let searchItem = new FormData();
      searchItem.append("sid", response.data.eid);
      searchItem.append(
        "params",
        JSON.stringify({
          spec: {
            itemsType: "avl_unit",
            propName: "sys_name",
            propValueMask: "*",
            sortType: "sys_name",
            propType: "property",
          },
          force: 1,
          // flags used 4194304 256 1 8192 1048576 4096
          flags: 5255425,
          from: 0,
          to: 0,
        })
      );
      await axios
        .post(
          "https://hst-api.wialon.com/wialon/ajax.html?svc=core/search_items",
          searchItem,
          { headers: searchItem.getHeaders() }
        )
        .then(async (itemResponse) => {
          let allUnits = itemResponse.data.items;
          let unitId = [];
          allUnits.map((unit) => {
            if (unit.uid == device_id) {
              let multiplier;
              let sensors = Object.keys(unit.sens);
              sensors.map((index) => {
                if (unit.sens[index].p == "can_fls") {
                  multiplier = unit.sens[index].tbl[0].a;
                }
              });

              unitId.push({ id: unit.id, calculation: multiplier });
            }
          });
          if (unitId.length === 1) {
            let getItem = new FormData();
            getItem.append("sid", response.data.eid);
            getItem.append(
              "params",
              JSON.stringify({
                itemId: unitId[0].id,
                timeFrom: start_time,
                timeTo: end_time,
                flags: 0x0003,
                flagsMask: 0xff03,
                loadCount: 0xffffffff,
              })
            );

            await axios
              .post(
                "https://hst-api.wialon.com/wialon/ajax.html?svc=messages/load_interval",
                getItem,
                { headers: getItem.getHeaders() }
              )
              .then((msgResponse) => {
                let organizedMsgs = [];
                let unitMessages = msgResponse.data.messages;
                unitMessages.map((msg) => {
                  let setMsg = {};
                  msg.pos["x"]
                    ? (setMsg.gps_latitude = msg.pos["x"])
                    : (setMsg.gps_latitude = "N/A");
                  msg.pos["y"]
                    ? (setMsg.gps_longitude = msg.pos["y"])
                    : (setMsg.gps_longitude = "N/A");
                  msg.pos["sc"]
                    ? (setMsg.gps_signal = msg.pos["sc"])
                    : (setMsg.gps_signal = "N/A");
                  msg.p["odo"]
                    ? (setMsg.mileage = msg.p["odo"])
                    : (setMsg.mileage = "N/A");
                  msg.p["can_fls"]
                    ? (setMsg.fuel_level =
                        msg.p.can_fls * unitId[0].calculation)
                    : (setMsg.fuel_level = "N/A");
                  msg.pos["c"]
                    ? (setMsg.direction = msg.pos["c"])
                    : (setMsg.direction = "N/A");
                  msg.p["wheel_speed"]
                    ? (setMsg.wheelbased_speed = msg.p["wheel_speed"])
                    : (setMsg.wheelbased_speed = "N/A");
                  msg["t"]
                    ? (setMsg.recorded_at = msg["t"])
                    : (setMsg.recorded_at = "N/A");
                  organizedMsgs.push(setMsg);
                });
                res.json(organizedMsgs);
              });
          }
        });
    });
});

// middlewares
function isAuth(req, res, next) {
  let authorization = req.headers.authorization.split("Bearer ")[1];
  if (!authorization) return res.sendStatus(404);
  if (authorization !== appKey) return res.sendStatus(401);
  try {
    req.headers.authorization = "Authorized";
    console.log("AppKey validated! User is authorized!");
    next();
  } catch (err) {
    console.error(err);
  }
}

const PORT = process.env.PORT || 8082;

app.listen(PORT, async () => {
  console.log(`SERVER STARTED AT PORT ${PORT}`);
  await consumeData();
});

// functions
const qCommands = "commands";
const sentQ = async (device_id, command_key) => {
  try {
    const connection = await amqp.connect("amqp://ekar:11223344@localhost");
    const channel = await connection.createChannel();
    const result = await channel.assertQueue(qCommands);
    channel.sendToQueue(
      qCommands,
      Buffer.from(
        JSON.stringify({ device_id: device_id, command_key: command_key })
      )
    );
  } catch (err) {
    console.error(err);
  }
};

const qUnits = "getUnits";
const consumeData = async () => {
  try {
    console.log("TELEMATICS CONSUMER STARTED!");
    console.log("WAITING FOR MESSAGES...");
    const conn = await amqp.connect("amqp://ekar:11223344@localhost");
    const channel = await conn.createChannel();
    const result = channel.assertQueue(qUnits);
    channel.consume(qUnits, (msg) => {
      if (msg !== null) {
        console.log("Message Consumed!");
        let data = {
          message: JSON.parse(msg.content.toString()),
          status: "Message Received!" + Date(),
        };
        console.log(data);
        liveTelematicsData = data.message;
        channel.ack(msg);
      }
    });
  } catch (err) {
    console.error(err);
  }
};
