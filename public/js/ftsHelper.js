var supportText = "Please, try again and contact support if the error persists";

function getConfig(){
  $.get("/config.php", function(data) {
        sessionStorage.ftsRestEndpoint=data.fts_address;
        sessionStorage.lmtWebsocketEndpoint=data.lmt.websocket_endpoint;
        sessionStorage.lmtHealthCheckEndpoint=data.lmt.health_check_endpoint;
        sessionStorage.jobsToList=data.job_to_list;
        sessionStorage.endpointsUrl=data.endpoint_list_url;
        sessionStorage.proxyCertHours=data.proxy_cert_hours;
        sessionStorage.cernboxBaseUrl=data.cernbox_base_url;
	});
}

function showError(jqXHR, textStatus, errorThrown, message) {
	console.log(message);
	console.log(jqXHR);
	console.log("ERROR: " + JSON.stringify(jqXHR));
	//alert("ERROR: " + JSON.stringify(jqXHR));
	console.log(textStatus + "," + errorThrown);
	if (jqXHR.status > 0)
		message += ". Reason: " + jqXHR.status + ": " + jqXHR.responseText;
		
	if (message != null)
		showUserError(message);	
	return message;
}

function getUserJobs(delegationId){
    var urlE = "/api/fts3/jobs"
        + "?state_in=SUBMITTED,ACTIVE,FINISHED,FAILED,CANCELED,FINISHEDDIRTY"
        + "&dlg_id=" + delegationId
        + "&limit="+ sessionStorage.jobsToList;
  $.support.cors = true;
  $.ajax({
    url : urlE,
    type : "GET",
    dataType : 'json',
    xhrFields : {
      withCredentials : true
    },
    success : function(data1, status) {
      loadJobTable(data1);
    },
    error : function(jqXHR, textStatus, errorThrown) {
      showError(jqXHR, textStatus, errorThrown, "Error retrieving user jobs. "+ supportText);
    }
  });

}

function getJobTranfers(jobId, isResubmit, overwrite, compare_checksum,resubmitAll){
  var urlE = "/api/fts3/job&job_id=" + jobId + "&field=files";
  $.support.cors = true;
  $.ajax({
    url : urlE,
    type : "GET",
    dataType : 'json',
    xhrFields : {
      withCredentials : true
    },
    success : function(data1, status) {
      if (isResubmit){
        rerunTransfer(data1, overwrite,compare_checksum,resubmitAll);
      } else {
        loadTransferTable(data1, jobId);
      }
    },
    error : function(jqXHR, textStatus, errorThrown) {
      showError(jqXHR, textStatus, errorThrown, "Error getting job details. "+ supportText);
    }
  });

}

function removeTransfer(jobID){
  var urlEndp = "/api/fts3/jobs"
  $.support.cors = true;
  $.ajax({
    url : urlEndp,
      type : "DELETE",
    dataType:'script',
      data: { 'function': 'job', 'job_id': jobID },
    type : "POST",
    xhrFields : {
      withCredentials : true
    },
    success : function(data1, status) {
      showUserSuccess("Transfer job removed successfully");
    },
    error : function(jqXHR, textStatus, errorThrown) {
      showError(jqXHR, textStatus, errorThrown, "Error removing the transfer job. "+ supportText);
    }
  });
}

function getUTCDate(time) {
  return time.getUTCFullYear().toString().substring(2, 4)
      + ("0" + (time.getUTCMonth() + 1).toString()).slice(-2)
      + ("0" + time.getUTCDate().toString()).slice(-2)
      + ("0" + time.getUTCHours().toString()).slice(-2)
      + ("0" + time.getUTCMinutes().toString()).slice(-2)
      + ("0" + time.getUTCSeconds().toString()).slice(-2)
      + "Z";
}

// Call to make the transfer between two endpoints
function ftsTransfer(theData) {
  var urlE = "/api/fts3/job";
    theData = JSON.stringify(theData);
  $.support.cors = true;
  outPut = $.ajax({
    url : urlE,
 type : "POST",
    data : theData,
    contentType : "application/json",
    dataType : 'json',
    processData : false,
    beforeSend : function(xhr) {
      xhr.withCredentials = true;
    },
    xhrFields : {
      withCredentials : true
    },
    success : function(x, status, xhr) {
      console.log("OK: " + JSON.stringify(x));
      console.log("    Status: " + status);
      showUserSuccess("Transfer job " + x['job_id'] +  " submitted successfully");
    },
    error : function(xhr, textStatus, errorThrown) {
      showError(xhr, textStatus, errorThrown, "Error submitting the transfer. " + supportText);
    }
  });
  return false;
}

function signRequest(sCert, userPrivateKeyPEM, userDN, userCERT) {
  var Re = new RegExp(",","g");
  userDN = userDN.replace(Re,"/");
  var subject = userDN + '/CN=proxy';

  var reHex = /^\s*(?:[0-9A-Fa-f][0-9A-Fa-f]\s*)+$/;
  try {
    var derServer = reHex.test(sCert) ? Hex.decode(sCert) : Base64E
        .unarmor(sCert);

    var derUser = reHex.test(userCERT) ? Hex.decode(userCERT) : Base64E
        .unarmor(userCERT);

    var asn1 = ASN11.decode(derServer);
    var pos = asn1.getCSRPubKey();
    //console.log(sCert);

    var ct = new X509();
    ct.readCertPEM(userCERT);
    var oIssuer = ct.getIssuerHex();
    var oSerial = ct.getSerialNumberHex();
    //console.log(oIssuer);

    var rsakey = new RSAKey();
    //The replace is because other wise something like this was
    //found "01 00 01" and only the last part, "01", was converted.
    //It was returning 1 instead of 65537
    rsakey.setPublic(pos.modulus.replace(/ /g, ''), pos.exponent.replace(/ /g, ''));

    // TODO: verify sign
    var tbsc = new KJUR.asn1.x509.TBSCertificate();

    // Time
    tbsc.setSerialNumberByParam({
      'int' : oSerial
    });
    tbsc.setSignatureAlgByParam({
      'name' : 'SHA512withRSA'
    });
    tbsc.setIssuerByParam({
      'str' : userDN
    });

    tbsc.asn1Issuer.hTLV = ct.getSubjectHex();

    tbsc.setSubjectByParam({
      'str' : subject
    });
    // Public key from server (from CSR)
    tbsc.setSubjectPublicKeyByParam({
      'rsakey' : rsakey
    });

    var ctime = new Date();
    ctime.setUTCHours(ctime.getUTCHours() - 1);
    tbsc.setNotBeforeByParam({
      'str' : getUTCDate(ctime)
    });
    ctime.setUTCHours(ctime.getUTCHours() + 1 + parseInt(sessionStorage.proxyCertHours));
    tbsc.setNotAfterByParam({
      'str' : getUTCDate(ctime)
    });

    tbsc.appendExtension(new KJUR.asn1.x509.BasicConstraints({'cA': false, 'critical': true}));
    // 101 to set 'Digital Signature, Key Encipherment'. 0 means disabled 'Non Repudiation'
    tbsc.appendExtension(new KJUR.asn1.x509.KeyUsage({'bin':'101', 'critical':true}));

    var s = KEYUTIL.getPEM(rsakey);
        var sHashHex = getSubjectKeyIdentifier(derUser);
        if (sHashHex !== null) {
                  var paramAKI = {'kid': {'hex': sHashHex }, 'issuer': oIssuer, 'critical': false};
      tbsc.appendExtension(new KJUR.asn1.x509.AuthorityKeyIdentifier(paramAKI));
    }
    // Sign and get PEM certificate with CA private key
    var userPrivateKey = new RSAKey();

    // The private RSA key can be obtained from the p12 certificate by using:
    // openssl pkcs12 -in yourCert.p12 -nocerts -nodes | openssl rsa
    userPrivateKey.readPrivateKeyFromPEMString(userPrivateKeyPEM);

    var cert = new KJUR.asn1.x509.Certificate({
      'tbscertobj' : tbsc,
      'rsaprvkey' : userPrivateKey,
      'prvkey' : userPrivateKey,
      'rsaprvpas' : "empty"
    });

    // TODO check times in all certificates involved to check that the
    // expiration in the
    // new one is not later than the others
    cert.sign();

    var pemCert = cert.getPEMString();
    //console.log(pemCert.replace(/^\s*$[\n\r]{1,}/gm, "\n"));

    //In case blank new lines...
    return pemCert.replace(/^\s*$[\n\r]{1,}/gm, "\n");
  } catch (e) {
                var derror = "Error delegating the user credentials: " + e;
                showDelegateError(derror);
    console.log("ERROR signing the CSR response: " + e);
                return "";
  }
}

function getSubjectKeyIdentifier(der) {
  var asn1 = ASN11.decode(der);
  var dom = asn1.toDOM();
  return getSKID(dom, "2.5.29.14");
};

function getSKID(dom, skid){
  if (dom.textContent.indexOf(skid) > -1){
    var n = dom.textContent.indexOf(skid);
    var n2 = dom.textContent.indexOf(skid, n+1);
    //Output should be like:
    //2.5.29.35authorityKeyIdentifierX.509 extensionOCTET STRING(1 elem)Offset: 654Length: 2+24(encapsulates)Value:(1 elem)SEQUENCE(1 elem)Offset: 656Length: 2+22(constructed)Value:(1 elem)[0](20 byte) 98CC92D04630368CB0ED980D7251A9474CAABE21
    var ext = dom.textContent.substring(n2, n2 + 300);
    var n3 = ext.indexOf("20 byte");
    return ext.substring(n3 + 9, n3 + 49);
  } else return null;
}

//Check delegation ID, save it and check if there is a valid proxy
function getDelegationID(fieldName, delegationNeeded){
  var urlEndp = "/api/fts3/userinfo";
  $.support.cors = true;
  $.ajax({
    url : urlEndp,
    type : "GET",
    dataType : 'json',
    success : function(data1, status) {
      console.log("Delegation obtained");
      $('input[id='+fieldName+']').val(data1.delegation_id);
      if (!delegationNeeded){
        hideUserReport();
        getUserJobs(data1.delegation_id);
      }
      isDelegated(data1.delegation_id, delegationNeeded);
    },
    error : function(jqXHR, textStatus, errorThrown) {
      showError(jqXHR, textStatus, errorThrown, "Error connecting to the FTS server to obtain the user credentials."+ supportText);
    }
  });
}

function isDelegated(delegationID, showModal){
    return true;
}

function runDataTransfer(delegationID, transferData){
  return checkAndTransfer(delegationID, transferData, true);
}

function removeDelegation(delegationID, showRemoveDelegationMessage){
  var urlEndp = sessionStorage.ftsRestEndpoint + "/delegation/" + delegationID;
  $.support.cors = true;
  $.ajax({
    url : urlEndp,
    //type : "DELETE" <-- use directly this is not working
    data: {"_method":"delete"},
    dataType:'script',
    type : "POST",
    xhrFields : {
      withCredentials : true
    },
    success : function(data1, status) {
      if (showRemoveDelegationMessage)
        console.log("delegation removed correctly");
      showDelegateModal();
      showNoProxyMessages();
    },
    error : function(jqXHR, textStatus, errorThrown) {
      showError(jqXHR, textStatus, errorThrown, "Error removing the existing delegation. "+ supportText);
    }
  });
}

//Check if there is a valid delegation done. Otherwise, do it
function checkAndTransfer(delegationID, transferData, showModal){
    ftsTransfer(transferData);
}

//Do delegation of credentials
function doDelegate(delegationID, userPrivateKeyPEM, userDN, userCERT, user_vo){
  var urlEndp = sessionStorage.ftsRestEndpoint + "/delegation/" + delegationID + "/request";
  $.support.cors = true;
  // Call 3: Asking for a new proxy certificate is needed
  $.ajax({
    url : urlEndp,
    type : "GET",
    xhrFields : {
      withCredentials : true
    },

    success : function(data3, status) {
      var x509Proxy = signRequest(data3, userPrivateKeyPEM, userDN, userCERT);
                        if ( x509Proxy =="" ) { return;}
      x509Proxy += "" + userCERT;
      //console.log(x509Proxy);
      urlEndp = sessionStorage.ftsRestEndpoint + "/delegation/" + delegationID + '/credential';
      // Call 4: Delegating the signed new proxy certificate
      $.ajax({
        url : urlEndp,
        type : "POST",
        contentType : "text/plain; charset=UTF-8",
        dataType : 'text',
        data: x509Proxy,
        processData : false,
        beforeSend : function(xhr) {
          xhr.withCredentials = true;
        },
        xhrFields : {
          withCredentials : true
        },

        success : function(data4, status) {
          if (user_vo == null || user_vo == ""){
            hideDelegateModal();
            isDelegated(delegationID, true); //To update remaining proxy time
          } else {
            getVOMSCredentials(delegationID, user_vo);
          }
        },
        error : function(jqXHR, textStatus,	errorThrown) {
          var derror = "Error delegating the user credentials. " + supportText;
          var emessage = showError(jqXHR, textStatus, errorThrown, derror);
          showDelegateError(emessage);
        }
      });
    },
    error : function(jqXHR, textStatus, errorThrown) {
      showError(jqXHR, textStatus, errorThrown, "Error connecting to the server for delegating the user credentials. " + supportText);
    }
  });
}

function getVOMSCredentials(delegationID, user_vo){
  var urlEndp = sessionStorage.ftsRestEndpoint + "/delegation/" + delegationID + "/voms";
  $.support.cors = true;
  var uvo = '["' + user_vo + '"]';

  $.ajax({
    url : urlEndp,
    type : "POST",
    contentType : "text/plain; charset=UTF-8",
    dataType : 'text',
    data: uvo,
    processData : false,
    beforeSend : function(xhr) {
      xhr.withCredentials = true;
    },
    xhrFields : {
      withCredentials : true
    },

    success : function(data4, status) {
      hideDelegateModal();
      isDelegated(delegationID, true); //To update remaining proxy time
    },
    error : function(jqXHR, textStatus,	errorThrown) {
      removeDelegation(delegationID, false);
      var verror = "Error obtaining VOMS credentials. " + supportText;
      var emessage = showError(jqXHR, textStatus, errorThrown, verror);
      showDelegateError(emessage);
    }
  });
}

function getEndpointContent(endpointInput, container, containerTable, indicator, stateText, filter){
    encodedEndpoint = encodeURIComponent(($('#' + endpointInput).val()).trim())
    urlEndp = "/api/fts3/dir&surl=" + encodedEndpoint;
    console.log(encodedEndpoint);
  $.support.cors = true;
	$.ajax({
		url : urlEndp,
		type : "GET",
		dataType : 'json',
		xhrFields : {
			withCredentials : true
		},
		
		success : function(data2, status) {
			ordered = {}
                        Object.keys(data2).sort().forEach(function(key) {
                                ordered[key] = data2[key];
                        });
			loadFolder(endpointInput, container, containerTable, ordered, indicator, stateText, filter);			
		},
		error : function(jqXHR, textStatus, errorThrown) {
			showError(jqXHR, textStatus, errorThrown, "Error connecting to the endpoint: it is not available, the folder does not exist or it has been selected a wrong protocol or address. "  + supportText);
			clearContentTable(containerTable, container, indicator, stateText);
		}
	});
} 

function millisecondsToStr (milliseconds) {
    // TIP: to find current time in milliseconds, use:
    // var  current_time_milliseconds = new Date().getTime();

    // This function does not deal with leap years, however,
    // it should not be an issue because the output is aproximated.

    function numberEnding (number) { //todo: replace with a wiser code
        return (number > 1) ? 's' : '';
    }

    var temp = milliseconds / 1000;
    var years = Math.floor(temp / 31536000);
    if (years) {
        return years + ' year' + numberEnding(years);
    }
    var days = Math.floor((temp %= 31536000) / 86400);
    if (days) {
        return days + ' day' + numberEnding(days);
    }
    var hours = Math.floor((temp %= 86400) / 3600);
    if (hours) {
        return hours + ' hour' + numberEnding(hours);
    }
    var minutes = Math.floor((temp %= 3600) / 60);
    if (minutes) {
        return minutes + ' minute' + numberEnding(minutes);
    }
    var seconds = temp % 60;
    if (seconds) {
        return seconds + ' second' + numberEnding(seconds);
    }
    return 'less then a second'; //'just now' //or other string you like;
}

