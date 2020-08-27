const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const FormData = require("form-data");

const app = express();

app.use(bodyParser.json());

const host = "https://hst-api.wialon.com/wialon/ajax.html?svc=token/login";
const token =
  "3967d327829405b78f89d0587a6a5b5c32549A0118C983FA4A725C0F2D9FFCEA005503B1";

app.get("/", (req, res) => {
  res.send("Get Units: '/getUnits'");
});

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
          // flags used 4194304 256 1 8192 1048576 4096
          flags: 5255425,
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
          let allUnits = itemResponse.data.items;
          let organizedData = [];
          allUnits.map((unit) => {
            let unixTime = Math.round(new Date().getTime() / 1000);

            let unitDetails = {};
            unitDetails.device_id = unit.uid;

            unitDetails.gps_latitude = unit.pos ? unit.pos["x"] : 0;
            unitDetails.gps_longitude = unit.pos ? unit.pos["y"] : 0;
            unitDetails.gps_signal = unit.pos ? unit.pos["sc"] : 0;
            unitDetails.mileage = unit.cnm;
            if (unit.sens) {
              let arrayKeys = Object.keys(unit.sens);
              arrayKeys.map((key) => {
                let sensors = unit.sens[key];

                if (sensors) {
                  if (sensors.tbl) {
                    if (sensors.tbl[0]) {
                      let multiplier = sensors.tbl[0].a;
                      let metrics = sensors.m;
                      if (unit.prms) {
                        if (unit.prms.can_fls) {
                          if (unit.prms.can_fls.v) {
                            let sensorValue = unit.prms.can_fls.v;
                            unitDetails.fuel_level =
                              sensorValue * multiplier + " " + metrics;
                          }
                        }
                      }
                    }
                  }
                }
                unitDetails.fuel_level = "Device Type Not Supported";
              });
            }
            unitDetails.direction = unit.pos ? unit.pos["c"] : 0;
            unitDetails.wheelbased_speed = unit.pos ? unit.pos["s"] : 0;
            unitDetails.recorded_at = unixTime;
            organizedData.push(unitDetails);
          });
          res.json(organizedData);
          // console.log(unit.prms);
          // console.log(organizedData);
        });
    });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`server now running at port ${PORT}`);
});
