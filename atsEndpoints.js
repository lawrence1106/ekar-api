require("dotenv").config();
const express = require("express");
const app = express();
const amqp = require("amqplib");
const axios = require("axios");
const bodyParser = require("body-parser");
const FormData = require("form-data");

app.use(bodyParser.json());

const host = "https://hst-api.wialon.com/wialon/ajax.html?svc=token/login";
const commandURL =
  "https://hst-api.wialon.com/wialon/ajax.html?svc=unit/exec_cmd";
const token = process.env.WIALON_TOKEN;
const mainAccToken =
  "3967d327829405b78f89d0587a6a5b5cA0C5C302CC1007C5EE5F00FB0362D169F875BDF4";
// expires after 1 hour
const commandToken =
  "404064b49a25b1e485bf0b60045376b9D0B9A45A2FEF13E46EDCC5160A27DB1638AC5B45";
const PORT = process.env.PORT || 8081;

app.post("/commands", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  let device_id = req.body.device_id;
  let command_key, param_key;

  switch (req.body.command_key) {
    case 1:
    case "Lock":
    case "lock":
      command_key = "DOOR_LOCK";
      param_key = 2;
      break;
    case 2:
    case "Unlock":
    case "unlock":
      command_key = "DOOR_UNLOCK";
      param_key = 2;
      break;
    case 3:
    case "Block":
    case "block":
      command_key = "IMMOBILIZER_ON";
      param_key = 1;
      break;
    case 4:
    case "Unblock":
    case "unblock":
      command_key = "IMMOBILIZER_OFF";
      param_key = 1;
      break;
    default:
      return res.json({ ERROR: "INVALID COMMAND" });
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
      timeout: 5,
      flags: 0,
    })
  );

  try {
    axios
      .post(commandURL, commandData, { headers: commandData.getHeaders() })
      .then((res) => {
        console.log(res);
      });
  } catch (err) {
    console.error(err);
  }
});

app.listen(PORT, async () => {
  console.log(`SERVER HAS STARTED AT PORT ${PORT}`);
  await getItems();
});

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

const getItems = async () => {
  let searchItems = new FormData();

  searchItems.append("sid", await getSid());
  searchItems.append(
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
      flags: 524288 + 1 + 256,
      from: 0,
      to: 0,
    })
  );

  let data = await axios
    .post(
      "https://hst-api.wialon.com/wialon/ajax.html?svc=core/search_items",
      searchItems,
      { headers: searchItems.getHeaders() }
    )
    .then((res) => {
      return res.data;
    });
  let units = data.items;
  units.map((unit) => {
    if (unit.id == 21762597) {
      console.log(unit);
    }
  });
};

const checkAccessRights = async () => {
  let formData = new FormData();

  formData.append("sid", await getSid());
  formData.append(
    "params",
    JSON.stringify({
      items: [19829509],
      accessFlags: 0x0001000000,
      serviceName: "",
    })
  );

  await axios
    .get(
      "https://hst-api.wialon.com/wialon/ajax.html?svc=core/check_items_billing",
      formData,
      { headers: formData.getHeaders() }
    )
    .then((res) => {
      console.log(res);
    });
};
