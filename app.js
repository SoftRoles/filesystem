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

//==================================================================================================
// Filesystem
//==================================================================================================
const dirTree = require('directory-tree');
var os = require("os")

app.get("/filesystem/files/:path", passport.authenticate('bearer', { session: false }), function (req, res) {
  request({
    url: "http://127.0.0.1:3000/mongodb/api/filesystem/files?path=" + req.params.path,
    headers: { "Authorization": "Bearer " + req.user.token }
  }, function (err, ress, body) {
    console.log(JSON.parse(body))
    res.send(JSON.parse(body))
  })
  //console.log(dirTree(req.query.path))
  // res.sendFile(__dirname + "/files/" + req.params.path)
})
app.get("/filesystem/dirtree", passport.authenticate('bearer', { session: false }), function (req, res) {
  //console.log(dirTree(req.query.path))
  res.send(dirTree(req.query.path))
})

app.get("/filesystem/homedir", passport.authenticate('bearer', { session: false }), function (req, res) {
  if (process.platform == "win32") res.send(os.homedir() + "\\desktop")
  else res.send(os.homedir())
})


app.listen(3001, function () {
  console.log("Service running on http://127.0.0.1:3001")
})

