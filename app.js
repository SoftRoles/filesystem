var express = require('express');
var assert = require('assert');
var request = require("request")

var passport = require('passport');
var passStrategyBearer = require('passport-http-bearer').Strategy;

var session = require('express-session');
var mongodbSessionStore = require('connect-mongodb-session')(session);

var mongoClient = require("mongodb").MongoClient
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


//==================================================================================================
// Bearer Passport
//==================================================================================================
passport.use(new passStrategyBearer(function (token, cb) {
  mongoClient.connect(mongodbUrl + "/auth", function (err, db) {
    db.collection("users").findOne({ token: token }, function (err, user) {
      if (err) return cb(err)
      if (!user) { return cb(null, false); }
      return cb(null, user);
      db.close();
    });
  });
}));

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
  mongoClient.connect(mongodbUrl + "/auth", function (err, db) {
    db.collection("users").findOne({ username: username }, function (err, user) {
      if (err) return cb(err)
      if (!user) { return cb(null, false); }
      return cb(null, user);
      db.close();
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
app.get('/filesystem/api', require("connect-ensure-login").ensureLoggedIn(), function (req, res) {
  if (!req.query.folder || !req.query.basename) return res.sendStatus(400)
  request({
    url: "http://127.0.0.1/mongodb/api/filesystem/files",
    method: "GET",
    headers: { "Authorization": "Bearer " + req.user.token },
    qs: req.query,
    json: true
  }, function (err, res2, body) {
    if (err) res.send(err)
    if (body.length === 1) res.sendFile(__dirname + "/files/" + body[0].folder + "/" + body[0].name)
    res.sendStatus(404)
  })
});

//-----------------------------------------------------------------------------
// filesytem : download
//-----------------------------------------------------------------------------
app.get('/filesystem/api/download', require("connect-ensure-login").ensureLoggedIn(), function (req, res) {
  if (!req.query.folder || !req.query.basename) return res.sendStatus(400)
  request({
    url: "http://127.0.0.1/mongodb/api/filesystem/files",
    method: "GET",
    headers: { "Authorization": "Bearer " + req.user.token },
    qs: req.query,
    json: true
  }, function (err, res2, body) {
    if (err) res.send(err)
    if (body.length === 1) res.download(__dirname + "/files/" + body[0].folder + "/" + body[0].name, body[0].basename)
    res.sendStatus(404)
  })
});

//-----------------------------------------------------------------------------
// filesytem : upload
//-----------------------------------------------------------------------------
var mkdirp = require("mkdirp")
var fs = require("fs")
var path = require("path")
var filesize = require("filesize")
app.use(require('express-fileupload')())
app.post('/filesystem/api/upload', require("connect-ensure-login").ensureLoggedIn(), function (req, res) {
  if (!req.files) return res.sendStatus(400)
  mkdirp("files/" + req.body.folder, function (err) {
    if (err) res.send(err)
    var file = {
      owners: req.body.owners ? req.body.owners.split(",") : [],
      users: req.body.users ? req.body.users.split(",") : [],
      basename: req.files.upload.name,
      name: String(Date.now()) + "-" + req.files.upload.name,
      folder: req.body.folder
    }
    req.files.upload.mv("files/" + file.folder + "/" + file.name, function (err) {
      if (err) res.send(err);
      file.size = fs.statSync(path.join(__dirname,"files/",file.folder,file.name)).size
      file.sizeStr = filesize(file.size)
      request({
        url: "http://127.0.0.1/mongodb/api/filesystem/files",
        method: "POST",
        headers: { "Authorization": "Bearer " + req.user.token },
        body: file,
        json: true
      }, function (err, res2, body) {
        if (err) res.send(err)
        res.status(201).send({status:"server"})
      })
    });
  })
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

