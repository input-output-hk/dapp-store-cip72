import dotenv from 'dotenv';
import blake2 from 'blake2';
import nacl from 'tweetnacl';
import fs from 'fs';
import canonicalize from 'canonicalize';
import * as util from 'tweetnacl-util';
import axios, { isAxiosError } from 'axios';
import _ from 'lodash';
import Ajv from 'ajv';

// eslint-disable-next-line
import schema from './offChainDataSchema.json' assert { type: 'json' };

nacl.util = util;

const MAX_CHARACTER_LENGTH = 64;

dotenv.config();

const splitString = (value) => {
  if (value.length === 0) {
    return [''];
  }

  const substrings = [];
  for (let i = 0; i < value.length; i += MAX_CHARACTER_LENGTH) {
    substrings.push(value.substring(i, i + MAX_CHARACTER_LENGTH));
  }

  return substrings;
};

const fetchMetadata = async (metadataUrl) => {
  try {
    console.log('Fetching metadata...');
    const res = await axios.get(metadataUrl);
    const metadata = res.data;
    if (!_.isObject(metadata) || _.isEmpty(metadata)) {
      throw new Error('Invalid metadata');
    }
    return metadata;
  } catch (error) {
    if (isAxiosError(error)) {
      throw new Error(`Request failed with status ${error.response.status}`);
    } else {
      throw error;
    }
  }
};

const validateMetadata = async (metadata) => {
  const ajv = new Ajv({ strict: false });
  const validate = ajv.compile(schema);
  const valid = validate(metadata);
  if (!valid) {
    const { errors } = validate;
    throw new Error(
      `Invalid metadata: ${errors.map((error) => `${error.instancePath} ${error.message}`)}`
    );
  }
  return true;
};

const calculateRootHash = (dappMetadata) => {
  const canonicalizedJson = canonicalize(dappMetadata);
  const hash = blake2.createHash('blake2b', { digestLength: 32 });
  return hash.update(Buffer.from(canonicalizedJson)).digest('hex');
};

const fetchAndParseMetadata = async (metadataUrl) => {
  if (!metadataUrl) {
    throw new Error('metadata url is required');
  }
  const dappMetadata = await fetchMetadata(metadataUrl);
  await validateMetadata(dappMetadata);
  return {
    metadata: dappMetadata,
    rootHash: calculateRootHash(dappMetadata)
  };
};

const generateMetadataJsonFile = (
  metadataFilePath,
  actionType,
  comment,
  metadataUrl,
  cipRootHash,
  metadata
) => {
  try {
    const { subject } = metadata;
    const offChainStoragePathArray = splitString(metadataUrl);

    const metadataJson = {
      1667: {
        subject,
        rootHash: cipRootHash,
        metadata: offChainStoragePathArray,
        type: {
          action: actionType,
          ...(comment && { comment })
        }
      }
    };

    fs.writeFileSync(metadataFilePath, JSON.stringify(metadataJson));
    return true;
  } catch (error) {
    return error;
  }
};

export { fetchAndParseMetadata, generateMetadataJsonFile };
