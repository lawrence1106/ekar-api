const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const FormData = require("form-data");

const app = express();

app.use(bodyParser.json());

const host = "https://hst-api.wialon.com/wialon/ajax.html?svc=token/login";
const token =
  "3967d327829405b78f89d0587a6a5b5c32549A0118C983FA4A725C0F2D9FFCEA005503B1";

app.get("/getUnits", (req, res) => {
  let formData = new FormData();
  formData.append("params", JSON.stringify({ token: token }));

  axios
    .post(host, formData, { headers: formData.getHeaders() })
    .then((response) => {
      let searchItems = new FormData();

      searchItems.append("sid", response.data.eid);
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
          flags: 4194561,
          from: 0,
          to: 0,
        })
      );

      axios
        .post(
          "https://hst-api.wialon.com/wialon/ajax.html?svc=core/search_items",
          searchItems,
          { headers: searchItems.getHeaders() }
        )
        .then((itemResponse) => {
          let allUnits = [];
          res.json(itemResponse.data);
          //   for (let i = 0; i < itemResponse.data.items.length; i++) {
          //     allUnits.push({
          //       [i]: {
          //         device_id: itemResponse.data.items[i].uid,
          //       },
          //     });
          //   }
          //   console.log(allUnits);
        });
    });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("server now running at port 3001");
});
