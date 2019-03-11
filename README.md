# Voog developer kit

This repository is intended to accumulate useful code snippets and examples
for developers working on Voog. Currently it only contains the `Duplicator`
class - an example of element duplication via the Voog REST API.

See also:

* [edicy-jsplugins](https://github.com/Edicy/edicy-jsplugins) - a similar
  repository containing mostly deprecated examples.
* [Voog developer documentation](https://www.voog.com/developers/)

## Duplicator

An ES5 pseudo-class for cloning an element into another catalog (i.e. element
listing page). Also clones the first gallery, if present. Requires jQuery
loaded globally as `$` and a `cloned_id` (Number) field on the element
definition. The latter links the source to the clone so that subsequent
duplication will not create a new element. See
[duplicator.js](https://github.com/Voog/devkit/duplicator/duplicator.js) for
details.

The class should be instantiated in edit mode and for the source language
only. Upon instantiation, a button initiating duplication is rendered into the
passed container. The source element ID and target page (catalog) title must
also be passed. On errors, the error message is displayed to the user within
the main container in addition to the console.

Synopsis:

```js
{% if editmode and element.page.language_code == "et" %}
  <script src="{{ javascripts_path }}/duplicator.js"></script>    
  <script>
    $(document).ready(function() {
      new Duplicator({
        sourceId: {{ element.id }},
        container: $('#duplicator_container'),
        targetPageTitle: 'Projects'
      });
    });
  </script>    
{% endif %}
```

