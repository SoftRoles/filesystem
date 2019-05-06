//=============================================================================
// modules
//=============================================================================
const express = require('express');
const argparse = require('argparse').ArgumentParser
const session = require('express-session');
const mongodbSessionStore = require('connect-mongodb-session')(session);
const passport = require('passport');
const mkdirp = require("mkdirp")
const fs = require("fs")
const path = require("path")
const filesize = require("filesize")
const moment = require("moment")
const assert = require('assert')
const dirTree = require('directory-tree');
const { noCache } = require('helmet');

//-------------------------------------
// arguments
//-------------------------------------
const argParser = new argparse({
  addHelp: true,
  description: 'Filesystem service'
})
argParser.addArgument(['-p', '--port'], { help: 'Listening port', defaultValue: '3001' })
const args = argParser.parseArgs()

//-------------------------------------
// mongodb
//-------------------------------------
let mongodb;
const mongoClient = require("mongodb").MongoClient
const mongoObjectId = require("mongodb").ObjectID
const mongodbUrl = "mongodb://127.0.0.1:27017"
mongoClient.connect(mongodbUrl, { poolSize: 10, useNewUrlParser: true }, function (err, client) {
  assert.equal(null, err);
  mongodb = client;
});

//=============================================================================
// http server
//=============================================================================
const app = express();

//-------------------------------------
// session store
//-------------------------------------
var store = new mongodbSessionStore({
  uri: mongodbUrl,
  databaseName: 'auth',
  collection: 'sessions'
});

// Catch errors
store.on('error', function (error) {
  assert.ifError(error);
  assert.ok(false);
});

var sessionOptions = {
  secret: 'This is a secret',
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
  },
  store: store,
  resave: true,
  saveUninitialized: true
}

app.use(session(sessionOptions));

//-------------------------------------
// authentication
//-------------------------------------
passport.serializeUser(function (user, cb) {
  cb(null, user.username);
});

passport.deserializeUser(function (username, cb) {
  mongodb.db("auth").collection("users").findOne({ username: username }, function (err, user) {
    if (err) return cb(err)
    if (!user) { return cb(null, false); }
    return cb(null, user);
  });
});

app.use(passport.initialize());
app.use(passport.session());

app.use(require('@softroles/authorize-bearer-token')(function (token, cb) {
  mongodb.db("auth").collection("users").findOne({ token: token }, function (err, user) {
    if (err) return cb(err)
    if (!user) { return cb(null, false); }
    return cb(null, user);
  });
}))

//-------------------------------------
// common middlewares
//-------------------------------------
// app.use(noCache())
app.use(require('morgan')('tiny'));
app.use(require('body-parser').json())
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(require("cors")())

//-------------------------------------
// fileupload middlewares
//-------------------------------------
app.use(require('express-fileupload')())


//=============================================================================
// api v1
//=============================================================================

//-------------------------------------
// files
//-------------------------------------
const filesFolder = path.normalize(path.join(__dirname,"../../Datas/files"))

app.get('/filesystem/api/v1/files', function (req, res) {
  req.query.users = req.user.username
  mongodb.db("filesystem").collection("files").find(req.query).toArray(function (err, docs) {
    if (err) res.send({ error: err })
    else res.send(docs)
  });
});

app.post('/filesystem/api/v1/files', function (req, res) {
  if (!req.files) return res.sendStatus(400)
  //console.log(req.files)
  //console.log(req.body)
  mkdirp(path.join(filesFolder, req.body.folder), function (err) {
    if (err) res.send(err)
    let file = {
      owners: req.body.owners ? req.body.owners.split(",") : [],
      users: req.body.users ? req.body.users.split(",") : [],
      basename: req.files.upload.name,
      name: String(Date.now()) + "-" + req.files.upload.name,
      folder: req.body.folder,
      mdate: req.body.mdate,
      date: moment().format("YYYY-MM-DD HH:mm:ss"),
      mimetype: req.files.upload.mimetype

    }
    //console.log(file)
    req.files.upload.mv(path.join(filesFolder, file.folder, file.name), function (err) {
      if (err) res.send(err);
      file.size = fs.statSync(path.join(filesFolder, file.folder, file.name)).size
      file.sizeStr = filesize(file.size)
      file.users.push(req.user.username)
      file.owners.push(req.user.username)
      if (file.users.indexOf("admin") === -1) { file.users.push("admin") }
      if (file.owners.indexOf("admin") === -1) { file.owners.push("admin") }
      console.log(file)
      mongodb.db("filesystem").collection("files").insertOne(file, function (err, r) {
        if (err) res.send({ error: err })
        else res.send(Object.assign({}, r.result, { insertedId: r.insertedId }, file))
      });
    });
  })
});

app.get('/filesystem/api/v1/files/:id', function (req, res) {
  let query = { users: req.user.username }
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
app.get("/filesystem/api/v1/dirtree", function (req, res) {
  if (req.user.username == "admin") res.send(dirTree(filesFolder))
  else res.send(403);
})

//=============================================================================
// start service
//=============================================================================
app.listen(Number(args.port), function () {
  console.log(`Service running on http://127.0.0.1:${args.port}`)
})
