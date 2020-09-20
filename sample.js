const express = require('express');
const app = express();

const PORT = process.env.PORT || 8085;

app.get("/sample", (req, res) => {
	res.json({ status: "nice!" });
});

app.listen(PORT, () => {
	console.log(`PORT STARTED RUNNING AT PORT ${PORT}`);
})
