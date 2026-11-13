import { bootCommon, brandHtml } from '../components/common.js';
document.getElementById('offlineBrand').innerHTML = brandHtml();
bootCommon();
document.getElementById('retryBtn').addEventListener('click', () => location.reload());
