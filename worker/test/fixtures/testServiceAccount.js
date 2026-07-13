// A throwaway RSA keypair generated locally for tests only
// (`node -e "require('crypto').generateKeyPairSync(...)"`). This is NOT a
// real Firebase/Google credential and is not tied to any real project or
// account — it exists purely so tests can exercise real RS256 JWT signing
// (via jose) end-to-end without hitting a real Firebase project.

export const TEST_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCUq4GSshwojGYb
1UUEkXbyr40kuoT1AAjO0ZKGcleJrjPJ9kv4ZDiw0/guXyZQVNNMNUXgohsSiEZ8
CHs2qGz1CU5vTHYyoeTsSW8UccL89jCYX1/DsjKMBzRUSDYS95+wABhMh7Gq1PVK
xWwpoVohpU6UJH07zdMUPBlCvb7KYWo6tqOagnB+SKuMQJIdkKdmGQ+tZI9lrw1g
ZdGwhUOQiT/+SoQwZ+LiL/JPdWpjFpLWNCEahZj/wJfQLDOdsSlf43XFqCqVcIoN
39Jj+tPgNfUmiQp+WI5F1assGu2P+qNYb2g8+ZIzb0sXy5cS2l1uwgKR38HRkkrp
ujAhVz2hAgMBAAECggEADiP/942EWyD7h1MyNNyHJU8oTCGHiuwdalqJpssSY3CT
0XZhRHd34u3Occ6wDLz8ugdpJZQVoh4fIiYGXi0H7AieEr0BkxBN/2F+tMGbS8c4
2Q1dRPZak3IN+qRBrG0sHafsp77SWc7Wo+2CO7Vypreb8UBFPx51ILwUpQH6NzKG
qW5kfz2s0twrNsPBsQD7vStYXkuOTi82S6/IfKt+K7c1YA4jOFceQvbT6kbR1v73
N8dhnfGUrg69qVnz1aZhKCplvX9oYw1DjR2XkwniP8CvQ8Sx4gaRLMLTmGjMrlDr
jaBQk20rhf018j3eRC6p6axy+TMrEt5xAxI8E9bZyQKBgQDM8I9CnKgZUv4xylqO
nzl98gbMy+cR/CW10k1IhSUa61TIj+PzWp+gmvUtfaDbW6vmctVXV99VUln03a6K
8n3qbDHTgG9cu4g1G2XhHgsiEBhbRrJNAp96ejFrqtTNzJ3L8TOwsDOGTX80+arE
O4xgTEK0BFfYJVusWI+W3zFvfQKBgQC5tfTJGDY1OYA7K//9wPeA7EEuLTPz58Jy
zuDHPwxYPC1raGy299BoI9MtvsPRi/5YvgZUvjn7fnFDpOht2sTnKpRgYWOFHuVz
6u80nrpa/Rva3fjM2rddYGlxqQ2Rs+VwuvToH7oTvFiwuMIpGmnPCsk0FADuIIn+
QYZMYBGn9QKBgCtVytVJDvqb5AhfQ5rY7G1HWky/6RKSgN7bo1/sV5ZDoN/wHUF+
LjblzWZbJEJ+NfE64wXfHOiLy13N6nSTJjEFw9t3UxUGypyAOKDLm4sOYDgc0OMb
5OEfKYgczXbfB5byX/3CpIKHrJhlGsj31o0eUxSBvpmD/MiKyYIbm/Z5AoGAOWbd
l77NGpyAX0nVYXjgx8++wegk89ICD3yUi+GYDjnjjByF5fQpTdcs8inR2xZbctCh
olX+FBdcKR1y3mnNjOpjXHsdyMro/3BxqaEaVv9/OaJ8wc0k+k7PqNspH40scTDI
fGs6F9mSzGT/VrccV2utD1TTiMc0AAv+1+Kl8nUCgYASaVa4utYiqEN06IHyBEvU
2S2fdKGFlvB1mcQHv6hD+nHjXtxQrmXw5uXcc/DuLBB2+rLIsFhe3LvezZXNiUdq
xvX6D3FYEKokdeqJU2kwY0HTHZjLsVZnLi3W4O9nq7JpAKGhUBuJHI/FriMNNC7m
gSWwVK/JLRYELeC6Ac7cTg==
-----END PRIVATE KEY-----
`;

export const TEST_SERVICE_ACCOUNT = {
  projectId: 'watch-together-test',
  clientEmail: 'test-sa@watch-together-test.iam.gserviceaccount.com',
  privateKey: TEST_PRIVATE_KEY_PEM,
};

export const TEST_SERVICE_ACCOUNT_JSON = JSON.stringify({
  project_id: TEST_SERVICE_ACCOUNT.projectId,
  client_email: TEST_SERVICE_ACCOUNT.clientEmail,
  private_key: TEST_SERVICE_ACCOUNT.privateKey,
});
