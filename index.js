//=============================================================================
// modules
//=============================================================================
const express = require('express');
const mkdirp = require("mkdirp")
const fs = require("fs")
const path = require("path")
const filesize = require("filesize")
const moment = require("moment")
const dirTree = require('directory-tree');

//=============================================================================
// http server
//=============================================================================
const app = express();

//-------------------------------------
// common middlewares
//-------------------------------------
app.use(require('morgan')('tiny'));
app.use(require('body-parser').json())
app.use(require('body-parser').urlencoded({ extended: true }));

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
const filesFolder = path.normalize(path.join(__dirname, "./files"))

app.get('/filesystem/test', function (req, res) {
  res.sendFile(__dirname + "/index.html")
});

app.post('/filesystem/files', function (req, res) {
  if (!req.files) return res.sendStatus(400)
  // req.body.size = parseInt(req.body.size)
  // req.body.lastModified = parseInt(req.body.lastModified)
  console.log(req.files)
  console.log(req.files.file)
  console.log(req.body)

  mkdirp(path.join(filesFolder, req.body.folder)).then(made => {
    if (req.files.files) {
      req.files.files.forEach(file => {
        file.mv(path.join(filesFolder, req.body.folder, file.name), function (err) {
          if (err) res.send(err);
        })
      })
    }
    else {
      req.files.file.mv(path.join(filesFolder, req.body.folder, req.files.file.name), function (err) {
        if (err) res.send(err);
      })
    }
  })
  
  res.send({})
});

app.get('/filesystem/files', function (req, res) {
  res.sendFile(path.join(filesFolder, req.query.path))
});

//-------------------------------------
// directory tree
//-------------------------------------
app.get("/filesystem/dirtree", function (req, res) {
  req.query.path = req.query.path || ""
  res.send(dirTree(path.join(filesFolder,req.query.path)))
})

//=============================================================================
// start service
//=============================================================================
app.listen(3001, function () {
  console.log(`Filesystem microservice running on http://127.0.0.1:3001`)
})
