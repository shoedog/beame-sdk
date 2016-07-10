"use strict";

var _ = require('underscore');
var fs = require('fs');
var jmespath = require('jmespath');
var debug = require("debug")("cred_api");
var BeameStore = require("../services/BeameStore");
var store = new BeameStore();
var Table = require('cli-table2');
var x509 = require('x509');
var developerServices = new(require('../core/DeveloperServices'))();
var atomServices = new(require('../core/AtomServices'))();
var edgeClientServices = new(require('../core/EdgeClientServices'))();
console.log("atomServices" + atomServices);
var GlobalConfig = require('../../config/ApiConfig.json');
var readline = require('readline');

///
//
// We want to print out
// Level, hostname,
//


function show(type, fqdn, format){
	debug("show %j %j %j", type,  fqdn, format);
	var headers = ['Name', "Print", "Serial", "SigAlg" ];

	var returnValues =listCreds(type, fqdn);
	var certs = [];
	var table = new Table({
		head: headers, 
		colWidths: [25, 65, 30, 30]
	});

	_.each(returnValues, _.bind(function(cert){
		var item = store.search(cert.hostname);
		var xcert = x509.parseCert(item[0].X509 + "");
		table.push([xcert.subject.commonName, xcert.fingerPrint, xcert.serial,  xcert.signatureAlgorithm]);
		certs.push(xcert);
	}, this));

	if(format == "json") {
		console.log(JSON.stringify(certs));
	}
	else {
		console.log(table.toString());
	}
}

function print_table(arrayToPrint, format){
	switch(format) {
		case "json":
		{
			console.log(JSON.stringify(arrayToPrint));
			break;
		};

		case "text":
		default:
		{
			var headers = [];
			_.each(arrayToPrint, function (item) {
				_.map(item, function(key, value ){
					headers.push(value);
				})
			});
			headers = _.uniq(headers);

			var table = new Table({
				head: headers
				, colWidths: [15, 70, 15]
			});
			_.each(arrayToPrint, function (item) {
				table.push([item.name, item.hostname, item.level]);
			});

			console.log(table.toString());

		};
	}
};

function listCreds(type, fqdn){
	var returnValues = [];
	if(type && !fqdn) {
		returnValues = store.list(type);
	}
	if(!type && fqdn) {
		returnValues = store.list("", fqdn);
	}
	if(!type && !fqdn) {
		returnValues = store.list();
	}
	return returnValues;
}

function list(type,  fqdn,format){
	debug("list %j %j %j", type,  fqdn, format);
	var returnValues = listCreds(type, fqdn);

	print_table(returnValues, format);

}

function create(type,  fqdn, atom, format){
	debug ( "create %j %j %j",  type,  atom, fqdn, format);
	var rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	if(type == "developer" && !fqdn){
		console.log("Please open " + GlobalConfig.Endpoints.AuthServer + " in your browser and complete the signup proccess ");
		rl.question("Please enter hostname form verification email:", function(hostname){
			rl.question("Please enter UID from the verificaton email:", function(uid){ 
				console.log("Getting Developer Certificates please wait... it takes about 30 seconds" + hostname + " " + uid);
				developerServices.completeDeveloperRegistration(hostname,uid,function(error,payload){
					if(!error){
						console.log("Developer succesfully registered");
						console.log('/**-------------Success----------------**/',payload);
						process.exit(0);
					}
					else{
						console.error(error);
						process.exit(1);
					}
				});

			});

		});
	}
	
	if(type == "atom" && fqdn && atom){
		console.log("Creating atom ", fqdn, atom);
		atomServices.createAtom(fqdn,atom, function(err, data) {
			console.log(data);
		
		});
	}
	if(type == "edgeclient" && fqdn) {
		var appEntry = store.search(fqdn);
		
		// currently sserge requires paremetrs for dev hostname

		//edgeClientServices.
	}
	//EdgeClientServices.prototype.createEdgeClient = function (developerHostname, appHostname, callback) {}
	rl.close();
}

function renew(type,  fqdn,format){
	debug ( "renew %j %j %j",  type,  fqdn, format);
}

function purge(type,  fqdn,format){
	debug ( "purge %j %j %j",  type,  fqdn, format);
}


module.exports = {
	show:	show,
	list:	list,
	create:	create,
	renew:	renew,
	purge:	purge
};