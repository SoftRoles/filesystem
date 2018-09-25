var express = require('express');
var assert = require('assert');
var request = require("request")

var passport = require('passport');
var passStrategyBearer = require('passport-http-bearer').Strategy;

var session = require('express-session');
var mongodbSessionStore = require('connect-mongodb-session')(session);

var mongoClient = require("mongodb").MongoClient
var mongoObjectId = require('mongodb').ObjectID;
var mongodbUrl = "mongodb://127.0.0.1:27017"

// Create a new Express application.
var app = express();

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

app.use(require('express-session')({
  secret: 'This is a secret',
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
  },
  store: store,
  // Boilerplate options, see:
  // * https://www.npmjs.com/package/express-session#resave
  // * https://www.npmjs.com/package/express-session#saveuninitialized
  resave: true,
  saveUninitialized: true
}));

app.use(require('morgan')('tiny'));
app.use(require('body-parser').json())
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(require("cors")())
app.use("/filesystem/bower_components", express.static(__dirname + "/public/bower_components"))
app.use("/filesystem/js", express.static(__dirname + "/public/js"))


// Configure Passport authenticated session persistence.
//
// In order to restore authentication state across HTTP requests, Passport needs
// to serialize users into and deserialize users out of the session.  The
// typical implementation of this is as simple as supplying the user ID when
// serializing, and querying the user record by ID from the database when
// deserializing.
passport.serializeUser(function (user, cb) {
  cb(null, user.username);
});

passport.deserializeUser(function (username, cb) {
  mongoClient.connect(mongodbUrl, { useNewUrlParser: true }, function (err, client) {
    client.db("auth").collection("users").findOne({ username: username }, function (err, user) {
      if (err) return cb(err)
      if (!user) { return cb(null, false); }
      return cb(null, user);
      client.close();
    });
  });
});

// Initialize Passport and restore authentication state, if any, from the
// session.
app.use(passport.initialize());
app.use(passport.session());

app.get('/filesystem', require('connect-ensure-login').ensureLoggedIn({ redirectTo: "/login?source=filesystem" }), function (req, res) {
  if (req.user.username == "admin") res.sendFile(__dirname + '/public/index.html')
  else { req.logout(); res.send(403); }
});

app.get('/filesystem/test/upload', require('connect-ensure-login').ensureLoggedIn({ redirectTo: "/login?source=filesystem/test/upload" }), function (req, res) {
  if (req.user.username == "admin") res.sendFile(__dirname + '/public/test/upload.html')
  else { req.logout(); res.send(403); }
});

//==================================================================================================
// Filesystem
//==================================================================================================

//-----------------------------------------------------------------------------
// filesytem : files
//-----------------------------------------------------------------------------
var mkdirp = require("mkdirp")
var fs = require("fs")
var os = require('os');
var path = require("path")
var filesize = require("filesize")
var moment = require("moment")

var filesFolder = ""
if(process.platform=="win32") filesFolder = path.join(os.homedir(), "desktop/Veriler/1001-files")
else filesFolder = path.join(os.homedir(), "Veriler/1001-files")

app.use(require('express-fileupload')())

app.get('/filesystem/api/files', require("connect-ensure-login").ensureLoggedIn(), function (req, res) {
  req.query.users = req.user.username
  mongoClient.connect(mongodbUrl, function (err, client) {
    client.db("filesystem").collection("files").find(req.query).toArray(function (err, docs) {
      if (err) res.send({ error: err })
      else res.send(docs)
      client.close();
    });
  });
});

app.post('/filesystem/api/files', require("connect-ensure-login").ensureLoggedIn(), function (req, res) {
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
      mongoClient.connect(mongodbUrl, function (err, client) {
        client.db("filesystem").collection("files").insertOne(file, function (err, r) {
          if (err) res.send({ error: err })
          else res.send(Object.assign({}, r.result, { insertedId: r.insertedId }, file))
          client.close()
        })
      });
    });
  })
});

app.get('/filesystem/api/files/:id', require("connect-ensure-login").ensureLoggedIn(), function (req, res) {
  var query = { users: req.user.username }
  query._id = mongoObjectId(req.params.id)
  mongoClient.connect(mongodbUrl, function (err, client) {
    client.db("filesystem").collection("files").findOne(query, function (err, doc) {
      if (err) res.send({ error: err })
      else {
        if (req.query.download) res.download(path.join(filesFolder, doc.folder, doc.name), doc.basename)
        else res.sendFile(path.join(filesFolder, doc.folder, doc.name))
      }
      client.close();
    });
  });
});
//-----------------------------------------------------------------------------
// filesytem : dirtree
//-----------------------------------------------------------------------------
const dirTree = require('directory-tree');
app.get("/filesystem/api/dirtree", passport.authenticate('bearer', { session: false }), function (req, res) {
  if (req.user.username == "admin") res.send(dirTree(req.query.path))
  else { req.logout(); res.send(403); }
})

//-----------------------------------------------------------------------------
// filesytem : homedir
//-----------------------------------------------------------------------------
var os = require("os")
app.get("/filesystem/api/homedir", passport.authenticate('bearer', { session: false }), function (req, res) {
  if (req.user.username == "admin") res.send(os.homedir() + "\\desktop")
  else { req.logout(); res.send(403); }
})


app.listen(3001, function () {
  console.log("Service running on http://127.0.0.1:3001")
})

