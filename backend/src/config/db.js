const mysql = require('mysql2/promise');
const path = require('path');
const { getDatabaseOptions } = require('./dbOptions');

require('dotenv').config({
  path: path.join(__dirname, '../../.env'),
});

const pool = mysql.createPool(getDatabaseOptions());

module.exports = pool;
