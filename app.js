var express = require('express');
var app = express();

//=====================================
// database
//=====================================
var assert = require('assert');

var mongodb;
var mongoClient = require("mongodb").MongoClient
var mongodbUrl = "mongodb://127.0.0.1:27017"
mongoClient.connect(mongodbUrl, { poolSize: 10, useNewUrlParser: true }, function (err, client) {
  assert.equal(null, err);
  mongodb = client;
});

//=====================================
// common middlewares
//=====================================
app.use(require('@softroles/authorize-local-user')())
app.use(require('morgan')('tiny'));
app.use(require('body-parser').json())
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(require("cors")())



//=============================================================================
// api
//=============================================================================

//-------------------------------------
// files
//-------------------------------------
var mkdirp = require("mkdirp")
var fs = require("fs")
var os = require('os');
var path = require("path")
var filesize = require("filesize")
var moment = require("moment")
var mongoObjectId = require('mongodb').ObjectID;

var filesFolder = path.normalize(path.join(__dirname,"../../Datas/files"))

app.use(require('express-fileupload')())

app.get('/filesystem/api/files', function (req, res) {
  req.query.users = req.user.username
  mongodb.db("filesystem").collection("files").find(req.query).toArray(function (err, docs) {
    if (err) res.send({ error: err })
    else res.send(docs)
  });
});

app.post('/filesystem/api/files', function (req, res) {
  if (!req.files) return res.sendStatus(400)
  mkdirp(path.join(filesFolder, req.body.folder), function (err) {
    if (err) res.send(err)
    var dt = new Date()
    var file = {
      owners: req.body.owners ? req.body.owners.split(",") : [],
      users: req.body.users ? req.body.users.split(",") : [],
      basename: req.files.upload.name,
      name: String(Date.now()) + "-" + req.files.upload.name,
      folder: req.body.folder,
      mate: req.body.mdate,
      date: moment().format("YYYY.MM.DD HH:mm:ss")
    }
    // console.log(req.body.mdate)
    req.files.upload.mv(path.join(filesFolder, file.folder, file.name), function (err) {
      if (err) res.send(err);
      file.size = fs.statSync(path.join(filesFolder, file.folder, file.name)).size
      file.sizeStr = filesize(file.size)

      file.users.push(req.user.username)
      file.owners.push(req.user.username)
      if (file.users.indexOf("admin") === -1) { file.users.push("admin") }
      if (file.owners.indexOf("admin") === -1) { file.owners.push("admin") }
      mongodb.db("filesystem").collection("files").insertOne(file, function (err, r) {
        if (err) res.send({ error: err })
        else res.send(Object.assign({}, r.result, { insertedId: r.insertedId }, file))
      });
    });
  })
});

app.get('/filesystem/api/files/:id', function (req, res) {
  var query = { users: req.user.username }
  query._id = mongoObjectId(req.params.id)
  mongodb.db("filesystem").collection("files").findOne(query, function (err, doc) {
    if (err) res.send({ error: err })
    else {
      if (req.query.download) res.download(path.join(filesFolder, doc.folder, doc.name), doc.basename)
      else res.sendFile(path.join(filesFolder, doc.folder, doc.name))
    }
  });
});

//-------------------------------------
// directory tree
//-------------------------------------
const dirTree = require('directory-tree');
app.get("/filesystem/api/dirtree", function (req, res) {
  if (req.user.username == "admin") res.send(dirTree(filesFolder))
  else res.send(403);
})

app.listen(3001, function () {
  console.log("Service running on http://127.0.0.1:3001")
})

