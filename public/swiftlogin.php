<?php
require __DIR__ . '/../vendor/autoload.php';

$username = $_POST["username"];
$password = $_POST["password"];
$projectId = $_POST["project_id"];
$storageName = $_POST["storage_name"];

//provide method here to generate OS token for Swift storage
$output = exec("python3 ../include/generate_os_token.py $password $username $projectId");
echo json_encode($output);

//header("Location: /public/submit.php");




