require("dotenv").config();
const amqp = require("amqplib");
const axios = require("axios");
const FormData = require("form-data");

const host = "https://hst-api.wialon.com/wialon/ajax.html?svc=token/login";
const commandURL =
  "https://hst-api.wialon.com/wialon/ajax.html?svc=unit/exec_cmd";
const searchItemUrl =
  "https://hst-api.wialon.com/wialon/ajax.html?svc=core/search_items";
const commandToken = process.env.COMMAND_TOKEN;

// functions

const getSid = async () => {
  let formData = new FormData();
  formData.append(
    "params",
    JSON.stringify({
      token: commandToken,
    })
  );

  let sid = await axios
    .post(host, formData, { headers: formData.getHeaders() })
    .then((res) => {
      return res.data.eid;
    });
  return sid;
};

const getUnitID = async (imei_no) => {
  let formData = new FormData();

  formData.append("sid", await getSid());

  formData.append(
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
      flags: 257,
      from: 0,
      to: 0,
    })
  );

  return await axios
    .post(searchItemUrl, formData, { headers: formData.getHeaders() })
    .then((res) => {
      let unitID;
      let data = res.data.items;
      data.map((unit) => {
        if (unit.uid == imei_no) {
          unitID = unit.id;
        }
      });
      return unitID;
    });
};

const execCmd = async (device_id, command_param) => {
  let command_key, param_key;
  switch (command_param) {
    case "Lock":
    case "lock":
      command_key = "DOOR_LOCK";
      param_key = 2;
      break;
    case "Unlock":
    case "unlock":
      command_key = "DOOR_UNLOCK";
      param_key = 2;
      break;
    case "Block":
    case "block":
      command_key = "IMMOBILIZER_ON";
      param_key = 1;
      break;
    case "Unblock":
    case "unblock":
      command_key = "IMMOBILIZER_OFF";
      param_key = 1;
      break;
    default:
      return res.sendStatus(400);
  }

  let commandData = new FormData();

  commandData.append("sid", await getSid());
  commandData.append(
    "params",
    JSON.stringify({
      itemId: device_id,
      commandName: command_key,
      linkType: "",
      param: param_key,
      timeout: 10,
      flags: 0,
    })
  );
  const sendCommand = async () => {
    try {
      return await axios
        .post(commandURL, commandData, { headers: commandData.getHeaders() })
        .then((res) => {
          if (Object.keys(res.data).length === 0) return true;
        });
    } catch (err) {
      return err;
    }
  };
  return await sendCommand();
};

const q = "commands";
const consumeMsg = async () => {
  try {
    const connection = await amqp.connect("amqp://ekar:11223344@localhost");
    const channel = await connection.createChannel();
    const result = await channel.assertQueue(q);
    channel.consume(q, async (msg) => {
      if (msg !== null) {
        let parsedMessage = JSON.parse(msg.content.toString());
        let imei_no = parsedMessage.device_id;
        let command_key = parsedMessage.command_key;

        console.log({ status: true, data: parsedMessage, date: Date() });

        let unitID = await getUnitID(imei_no);

        console.log("Executing Command");

        let sendCommand = await execCmd(unitID, command_key);

        if (sendCommand === true) {
          console.log("Command Executed!");
          console.log("Acknowledging Message...");
        } else {
          console.log("Taihen desu!");
        }
        channel.ack(msg);
        console.log("Message Acknowledge!");
      }
    });
  } catch (err) {
    console.error(err);
  }
};

consumeMsg();
