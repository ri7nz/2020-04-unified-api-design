#!/usr/bin/env node

// ****************************************************
// unified - an ALPS-to-??? translator
//
// author:  @mamund
// date:    2020-04
//
// notes    install as npm install -g .
//          echoes to console, use pipe to save to file
// ****************************************************

const chalk = require("chalk");
const boxen = require("boxen");
const yargs = require("yargs");
const YAML = require("yamljs");
const fs = require('fs');

const options = yargs
 .usage("Usage: -f <alps file> -t <format type> -o <outfile>")
 .option("f", { alias: "file", describe: "Input file (alps.yaml)", type: "string", demandOption: true })
 .option("t", { alias: "type", describe: "Format Type ([j]son, [p]roto, [s]dl, [a]syncapi, [o]penapi)", type: "string", demandOption: false})
 .option("o", { alias: "out", describe: "Output file", type: "string", demandOption: false})
 .argv;

const rxHash = /#/g;

var alps_document = {};
var format = "json";
var rtn = "";

// convert YAML into JSON
try {
  alps_document = YAML.load(options.file);
} catch(err) {
  console.log("ERROR: " + err);
}

// selection translation
try {
  format = options.type.toLowerCase();
} catch {
  format = "json";
}

// handle requested translation
switch (format) {
  case "s":
  case "sdl":
    rtn = toSDL(alps_document);
    break;
  case "a":
  case "asyncapi":
    rtn = toAsync(alps_document);
    break;
  case "o":		
  case "openapi":
    rtn = toOAS(alps_document);
    break;
  case "p":
  case "proto":
    rtn = toProto(alps_document);
    break;
  case "j":
  case "json":
    rtn = toJSON(alps_document);
    break;		
  default:
    console.log("ERROR: unknown format: "+format);
}

// output directly
if(options.out) {
  fs.writeFileSync(options.out, rtn);
}
else {
  console.log(rtn);
}

// *******************************************
// translators
// *******************************************

// to ALPS JSON
function toJSON(doc) {
  var rtn = ""; 
  rtn = JSON.stringify(doc, null, 2);
  return rtn
}

// to proto file
function toProto(doc) {
  var rtn = "";
  var obj;
  var coll;

  rtn += 'syntax = "proto3";\n';
  rtn += 'package = "'+doc.alps.name+'"\n';
  rtn += '\n';

  // params
  coll = doc.alps.descriptor.filter(semantic);
  coll.forEach(function(msg) {
    rtn += 'message '+msg.id+'Params {\n';
    var c = 0;
    c++;
    rtn += '  string '+msg.id+' = '+c+';\n';    
    rtn += '}\n';
  });
  rtn += '\n';

  // objects
  coll = doc.alps.descriptor.filter(groups);
  coll.forEach(function(msg) {
    rtn += 'message '+msg.id+' {\n';
    var c = 0;
    msg.descriptor.forEach(function(prop) {
      c++;
      rtn += '  string '+prop.href+' = '+c+';\n';    
    });
    rtn += '}\n';
    rtn += 'message '+msg.id+'Response {\n';
    rtn += '  repeated '+msg.id+' '+msg.id+'Collection = 1\n'
    rtn += '}\n';
  });
  rtn += '\n';


  // procedures
  rtn += 'service '+doc.alps.name+'Service {\n';
  
  coll = doc.alps.descriptor.filter(safe);
  coll.forEach(function(item) {
    rtn += '  rpc '+item.id+'('
    if(item.descriptor) {
      rtn += item.descriptor[0].href;      
    }
    rtn += ') returns ('+item.rt+'Collection ) {}\n';  
  });
  
  coll = doc.alps.descriptor.filter(unsafe);
  coll.forEach(function(item) {
    rtn += '  rpc '+item.id+'('
    if(item.descriptor) {
      rtn += item.descriptor[0].href;      
    }
    rtn += ') returns ('+item.rt+'Collection ) {}\n';  
  });

  coll = doc.alps.descriptor.filter(idempotent);
  coll.forEach(function(item) {
    rtn += '  rpc '+item.id+'('
    if(item.descriptor) {
      rtn += item.descriptor[0].href;
      if(item.descriptor[0].href === "#id") {
        rtn += "Params";
      }      
    }
    rtn += ') returns ('+item.rt+'Collection) {}\n';  
  });
  
  rtn += '}\n';
 
  // clean up 
  rtn = rtn.replace(rxHash,"");
   
  return rtn;
}

// to graphql sdl
function toSDL(doc) {
  var rtn = "";
  var coll;

  // types
  coll = doc.alps.descriptor.filter(groups);
  coll.forEach(function(item) {
    rtn += 'type '+item.id+' {\n';
    item.descriptor.forEach(function(prop) {
      rtn += '  '+prop.href+': String\n';    
    });
    rtn += '}\n';
  }); 
  rtn += '\n';
  
  // query
  coll = doc.alps.descriptor.filter(safe);
  coll.forEach(function(item) {
    rtn += 'type Query {\n';
    rtn += '  ' +item.id+': ['+item.rt+']\n';
    rtn += '}\n';
  });
  rtn += '\n';

  // mutations
  rtn += 'Mutation {\n';
  coll = doc.alps.descriptor.filter(unsafe);
  coll.forEach(function(item) {
    rtn += '  '+item.id+'(';
    if(item.descriptor) {
      rtn += item.descriptor[0].href+': Object';
    }  
    rtn += '): '+item.rt+'\n';
  });                       
  coll = doc.alps.descriptor.filter(idempotent);
  coll.forEach(function(item) {
    rtn += '  '+item.id+'(';
    if(item.descriptor) {
      rtn += item.descriptor[0].href+': String';
    }  
    rtn += '): '+item.rt+'\n';  
  });                       
  rtn += '}\n';

  rtn = rtn.replace(rxHash,"");
  
  return rtn;
}

function toOAS(doc) {
  var rtn = "";
  rtn = toJSON(doc);
  return rtn;
}

function toAsync(doc) {
  var rtn = "";
  rtn = toJSON(doc);
  return rtn;
}

//*******************************************
// write out file
//*******************************************
function writeFile(fileName, doc) {
  fs.writeSyncFile(fileName, doc); 
}

//*******************************************
// collection filters
//*******************************************
function semantic(doc) {
  return doc.type === "semantic";
}

function groups(doc) {
  return doc.type === "group";
}

function safe(doc) {
  return  doc.type === "safe";
}

function unsafe(doc) {
  return  doc.type === "unsafe";
}

function idempotent(doc) {
  return  doc.type === "idempotent";
}

