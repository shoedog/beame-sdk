/**
 * Created by zenit1 on 03/07/2016.
 */
var debug = require("debug")("./src/services/DeveloperServices.js");
var os = require('os');
var _ = require('underscore');
var home = os.homedir();
var devPath = home + "/.beame/";              //path to store dev data: uid, hostname, key, certs, appData

var responseKeys = require('../../config/ResponseKeys.json');
var provisionApi = new (require('../services/ProvisionApi'))();
var dataServices = new (require('../services/DataServices'))();
var beameUtils = require('../utils/BeameUtils');
var apiActions = require('../../config/ApiConfig.json').Actions.DeveloperApi;

//private callbacks

/**
 * try read metadata file for node
 * @param {String} devDir
 * @param {String} hostname
 * @returns {Promise.<Object>}
 */
var getDeveloperMetadata = function (devDir,hostname) {

    return new Promise(function (resolve, reject) {

        var developerMetadataPath = devDir + beameUtils.metadataFileName;
        var metadata = dataServices.readJSON(developerMetadataPath);

        if (_.isEmpty(metadata)) {
            var errorJson = beameUtils.formatDebugMessage(global.AppModules.Developer, global.MessageCodes.MetadataEmpty, "metadata.json for is empty", {"hostname": hostname});
            console.error(errorJson);
            reject(errorJson);
        }
        else {
            resolve(metadata);
        }

    });
};

/**
 *
 * @param {Object} developerName
 * @param {Function} cb
 * @this {DeveloperServices}
 */
var createDeveloperRequest = function (developerName, cb) {

    var postData = {
        name: developerName
    };

    var apiData = beameUtils.getApiData(apiActions.CreateDeveloper.endpoint, postData, true);

    provisionApi.runRestfulAPI(apiData, function (error, payload) {
        if (!error) {

            payload.name = developerName;

            var devDir = devPath + payload.hostname + '/';

            dataServices.createDir(devDir);

            dataServices.savePayload(devDir + beameUtils.metadataFileName, payload, responseKeys.DeveloperCreateResponseKeys, function (error) {
                if (!cb) return;

                if (!error) {
                    cb(null, payload);
                }
                else {
                    cb(error, null);
                }
            });

        }
        else {
            var msg = beameUtils.formatDebugMessage(global.AppModules.Developer, global.MessageCodes.ApiRestError, "Rest Api Error", {"error": error});
            console.error(msg);
            cb && cb(msg, null);
        }

    });
};


/**
 * Developer services
 * @constructor
 */
var DeveloperServices = function () {

    dataServices.createDir(devPath);
};

/**
 * Register developer => Receive developer Certs => Update developer profile
 * @param {String} developerName
 * @param {String} developerEmail
 * @param {Function} callback
 */
DeveloperServices.prototype.createDeveloper = function (developerName, developerEmail, callback) {
    var self = this;

    var debugMsg = beameUtils.formatDebugMessage(global.AppModules.Developer, global.MessageCodes.DebugInfo, "Call Create Developer", {"name": developerName,"email": developerEmail});
    debug(debugMsg);

    self.registerDeveloper(developerName, function (error, payload) {
        if (!error) {
            console.log(payload);
            var hostname = payload.hostname;
            self.getDevCert(hostname, function (error, payload) {
                if (!error) {
                    console.log(payload);
                    self.updateProfile(hostname, developerEmail, developerName, callback);
                }
                else {
                    callback && callback(error, null);
                }
            });
        }
        else {
            callback && callback(error, null);
        }
    });
};

/**
 *
 * @param {String|null|undefined} [developerName]
 * @param {Function} callback
 */
DeveloperServices.prototype.registerDeveloper = function (developerName, callback) {
    var self = this;

    var authData = beameUtils.getAuthToken(home + "/authData/pk.pem", home + "/authData/x509.pem", false, false);

    provisionApi.setAuthData(authData, function () {

        createDeveloperRequest.call(self, developerName, callback);

    });

};

/**
 *
 * @param {String} hostname => developer hostname
 * @param {Function} callback
 */
DeveloperServices.prototype.getDevCert = function (hostname, callback) {
    var errorJson;

    if (!hostname) {
        errorJson = beameUtils.formatDebugMessage(global.AppModules.Developer, global.MessageCodes.HostnameRequired, "Get developer certs, hostname missing", {"error": "hostname missing"});
        debug(errorJson);

        callback && callback(errorJson, null);
        return;
    }

    /*---------- check if developer exists -------------------*/
    var devDir = devPath + hostname + "/";
    if (!dataServices.isPathExists(devDir)) {//provided invalid hostname
        var errorJson = beameUtils.formatDebugMessage(global.AppModules.Developer, global.MessageCodes.NodeFolderNotExists, "Provided hostname is invalid, list ./.beame to see existing hostnames", {"hostname": hostname});
        console.error(errorJson);
        callback(errorJson, null);
        return;
    }

    /*---------- read developer data and proceed -------------*/

    getDeveloperMetadata(devDir,hostname).then(function onSuccess(metadata) {
        /*----------- generate RSA key + csr and post to provision ---------*/
        var authData = beameUtils.getAuthToken(home + "/authData/pk.pem", home + "/authData/x509.pem", true, true, devDir, hostname);

        provisionApi.setAuthData(authData, function (csr) {
            if (csr != null) {

                var postData = {
                    csr: csr,
                    uid: metadata.uid
                };

                var apiData = beameUtils.getApiData(apiActions.GetCert.endpoint, postData, true);

                provisionApi.runRestfulAPI(apiData, function (error, payload) {
                    if (!error) {

                        dataServices.saveCerts(devDir, payload, responseKeys.CertificateResponseKeys, callback);
                    }
                    else {
                        errorJson = {"message": "CSR for " + hostname + " failed"};
                        console.error(errorJson);
                        callback(errorJson, null);
                    }
                });
            }
            else {
                errorJson = beameUtils.formatDebugMessage(global.AppModules.Developer, global.MessageCodes.CSRCreationFailed, "CSR not created", {"hostname": hostname});
                console.error(errorJson);
                callback && callback(errorJson, null);
            }
        });
    }, function onError(error) {
        callback(error, null);
    });


};

/**
 *
 * @param {String} hostname => developer hostname
 * @param {String} email
 * @param {String|null|undefined} [name]
 * @param {Function} callback
 */
DeveloperServices.prototype.updateProfile = function (hostname, email, name, callback) {

    /*---------- check if developer exists -------------------*/
    var devDir = devPath + hostname + "/";

    if (!dataServices.isNodeFilesExists(devDir, responseKeys.NodeFiles)) {
        var msg = beameUtils.formatDebugMessage(global.AppModules.Developer, global.MessageCodes.NodeFilesMissing, "developer files not found", {"hostname": hostname});
        console.error(msg);
        callback && callback(msg, null);
        return;
    }

    /*---------- read developer data and proceed -------------*/
    getDeveloperMetadata(devDir,hostname).then(function onSuccess(metadata) {
        var authData = beameUtils.getAuthToken(devDir + global.CertFileNames.PRIVATE_KEY, devDir + global.CertFileNames.X509, false, false, devDir, hostname);

        provisionApi.setAuthData(authData, function () {

            var postData = {
                email: email,
                name: name ? name : metadata.name
            };

            var apiData = beameUtils.getApiData(apiActions.UpdateProfile.endpoint, postData, false);


            provisionApi.runRestfulAPI(apiData, function (error) {
                if (!error) {
                    /*---------- update metadata -------------*/
                    metadata.name = postData.name;
                    metadata.email = email;

                    dataServices.saveFile(devDir + beameUtils.metadataFileName, beameUtils.stringify(metadata));

                    callback(null, metadata);
                }
                else {
                    console.error(error);
                    callback(error, null);
                }
            });
        });

    }, function onError(error) {
        callback(error, null);
    });

};

module.exports = DeveloperServices;