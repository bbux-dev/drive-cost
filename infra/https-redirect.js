export default {
  fetch(request) {
    const url = new URL(request.url);
    if (url.protocol !== 'http:') return new Response('Not found', { status: 404 });
    url.protocol = 'https:';
    url.hostname = 'drivecost.bxtn.dev';
    url.port = '';
    return Response.redirect(url.href, 301);
  },
};
