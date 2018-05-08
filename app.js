var express = require('express')
var bodyParser = require("body-parser")
var cors = require("cors")

const PATH = require('path');
const dirTree = require('directory-tree');

const app = express();
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cors())
app.use(express.static(__dirname + "/test"))
app.listen(3001, function () {
  console.log("Service running on http://127.0.0.1:3001")
})

app.get("/api", function (req, res) {
  res.send(dirTree(req.query.path))
})
