---
url: /home
---

<ul>
{% assign posts=site.posts | where:"ref", page.ref | sort: 'lang' %}
{% for post in posts %}
<li>
<a href="{{ post.url }}" class="{{ post.lang }}">{{ post.title }}</a>
</li>
{% endfor %}

</ul>