const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const querySting = require("querystring");

const app = express();

app.use(bodyParser.json());

const token =
  "3967d327829405b78f89d0587a6a5b5c04293B284D22369262B539328FC36368E351B4B8";

app.get("/login", (req, res) => {
  axios
    .get(
      `http://hst-api.wialon.com/wialon/ajax.html?svc=token/login&params={%22token%22:%223967d327829405b78f89d0587a6a5b5c04293B284D22369262B539328FC36368E351B4B8%22}`
    )
    .then((response) => {
      res.send(response.data);
    });
});

const PORT = "3001";

app.listen(PORT, () => {
  console.log("server now running at port 3001");
});
