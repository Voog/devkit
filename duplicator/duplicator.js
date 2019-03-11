
Duplicator = function(attrs) {
  
    // An ES5 class for cloning an element into another catalog (element
    // listing page). Also clones the first gallery, if present. Requires
    // jQuery loaded globally as `$` and a `cloned_id` (Number) field on the
    // element definition. The latter links the source to the clone so that
    // subsequent duplication will not create a new element.
    // 
    // Attributes:
    // 
    // sourceId        - ID of the element to clone, required
    // container       - container for rendering the controls (selector or 
    //                   jQuery), required
    // targetPageTitle - title of the target catalog (element listing page), 
    //                   required
    // targetTitle     - title of the target element, defaults to source's 
    //                   title
    
    Object.assign(this, attrs);
    
    this.buttonEnabledText = null;
    this.container = $(this.container);
    
    this.render();
    this.attachBehavior();
};
  
Duplicator.prototype.render = function() {
  this.container.empty();
  
  this.container.append(
    '<button id="duplicator_btn">Duplicate element</button>' +
    '<div id="duplicator_error"></div>'
  );
};
  
Duplicator.prototype.attachBehavior = function() {
  var _this = this;

  $('#duplicator_btn').click(function() {
    Edicy.trigger('edicy:save');
    
    if (confirm('Are you certain you wish to duplicate the element?')) {
      _this.clone();
    }
  });
};

Duplicator.prototype.clone = function() {
  var _this = this;
  var id = this.sourceId;
  var targetPageId;
  
  this.err();
  this.disableButton();
    
  this.getTargetPageId()
    .then(function(incomingTargetPageId) {
      targetPageId = incomingTargetPageId;
      return _this.get('/admin/api/elements/' + id);
    })
    .then(function(sourceData) {
      var values = sourceData.values;
      var cloneId = values.cloned_id;
      
      var payload = {
        element_definition_id: sourceData.element_definition.id,
        title: _this.targetTitle || sourceData.title,
        page_id: targetPageId,
        values: Object.assign({}, values)
      };
      
      // If no linked clone, create a new clone and link the original element;
      // otherwise update existing clone.
      
      if (cloneId == null) {
        _this.createClone(sourceData, payload);
      }
      else {
        _this.updateClone(sourceData, cloneId, payload);
      }
    })
    .fail(function(message) {
      if ($.type(message) === 'string') {
        _this.err(message);
      }
    });
};

Duplicator.prototype.getTargetPageId = function() {
  
  // Get the target page ID. Returns a promise.
  
  var pageTitle = this.targetPageTitle;
  var errorMessage = 'Could not find target catalog "' + pageTitle + '"';

  return this.get('/admin/api/pages?language_code=en&content_type=elements').then(function(data) {
    var pageId;
    
    $.each(data, function(i, page) {
      if (page.title === pageTitle) {
        pageId = page.id;
        return false;
      }
    });
    
    return pageId == null ? $.Deferred().reject(errorMessage) : pageId;
  });
}
  
Duplicator.prototype.createClone = function(sourceData, payload) {
  
  // Create a new clone.
  
  var _this = this;
  var id = this.sourceId;
  var cloneData;
  
  this.upsertElement(payload)
    .then(function(data) {
      
      // Link source to clone: update source's `cloned_id`.
      
      cloneData = data;      
      return _this.upsertElement({values: {cloned_id: data.id}}, 'PUT', id);
    })
    .then(function(data) {          
      return _this.cloneGallery(sourceData, cloneData.id);
    })
    .then(function() {
      _this.finalize(cloneData);
    });
}
  
Duplicator.prototype.updateClone = function(sourceData, cloneId, payload) {
  
  // Update an existing clone.
  
  var _this = this;
  
  payload.values.cloned_id = null;
  
  this.upsertElement(payload, 'PUT', cloneId)
    .then(function(data) {
      cloneData = data;      
      return _this.deleteGalleries(data);
    })
    .then(function() {
      return _this.cloneGallery(sourceData, cloneId);
    })
    .then(function() {
      _this.finalize(cloneData);
    });  
}
  
Duplicator.prototype.deleteGalleries = function(cloneData) {
  
  // Delete any galleries on a cloned element sequentially to avoid
  // deadlocks.
  
  var _this = this;
  var deletePromise = $.Deferred().resolve();
  
  return this.get(cloneData.contents_url).done(function(data) {
    $.each(data, function(i, v) {
      if (v.content_type === 'gallery') {
        deletePromise = deletePromise.then(function() {
          return _this.makeRequest({url: v.url, method: 'DELETE'});
        });
      }
    });

    return deletePromise;
  });  
}

Duplicator.prototype.cloneGallery = function(sourceData, cloneId) {
  
  // Clone the first gallery on the source element, if any.
  
  var _this = this;
  var sourceContent;
  var promise;
  
  // Retrieve contents attached to source element, find first gallery
  
  promise = this.get(sourceData.contents_url).done(function(data) {
    $.each(data, function(i, v) {
      if (v.content_type === 'gallery') {
        sourceContent = v;
        return false;
      }
    });
  });

  // Create gallery on target element, add assets.
  
  return promise.then(function() {
    if (!sourceContent || !sourceContent.gallery) {
      return;
    }

    var sourceGallery = sourceContent.gallery;
    var assets = sourceGallery.assets.map(function(asset) {
      return _.pick(asset, ['id', 'position', 'title', 'settings']);
    });
    var createContentUrl = '/admin/api/elements/' + cloneId + '/contents';
    var addAssetUrl;

    return _this.makeRequest({
      url: createContentUrl,
      payload: {
        name: 'extra',
        content_type: 'gallery'
      }
    })
    .then(function(data) {
      return _this.makeRequest({
        method: 'PUT',
        url: data.gallery.url,
        payload: Object.assign(
          _.pick(sourceGallery, ['kind', 'title', 'settings']),
          {assets: assets}
        )
      })
    });
  })
}

Duplicator.prototype.finalize = function(cloneData) {
  
  // Post-duplication tasks.
  
  window.location = cloneData.public_url;
}
  
Duplicator.prototype.get = function(url, callback) {
  return this.makeRequest({
    method: 'GET',
    url: url
  });
}

Duplicator.prototype.upsertElement = function(payload, method, id) {
  
  // Create or update an element.
  
  var id = id ? '/' + id : '';
  
  return this.makeRequest({
    payload: payload,
    method: method,
    url: '/admin/api/elements' + id
  });
}
  
Duplicator.prototype.makeRequest = function(attrs) {
  
  // Low-level API interface routine. Attributes:
  // 
  // method  - HTTP method, POST by default
  // payload
  // url
  
  var _this = this;
  var method = attrs.method || 'POST';
  var url = attrs.url;
  
  return $.ajax({
    type: method,
    url: url,
    data: attrs.payload ? JSON.stringify(attrs.payload) : null,
    contentType: attrs.payload ? 'application/json' : null,
    error: function(jqXHR) {
      _this.err(
        'API request', method, url, ' failed (', jqXHR.status, '/', jqXHR.statusText, ')'
      );
    }
  });
};

Duplicator.prototype.enableButton = function() {
  var button = $('#duplicator_btn');  
  button.attr('disabled', false).text(this.buttonEnabledText || '');
};
  
Duplicator.prototype.disableButton = function() {
  var disabledText = 'Please wait ...';
  var button = $('#duplicator_btn');
  
  this.buttonEnabledText = button.text();
  button.attr('disabled', true).text(disabledText);
};

Duplicator.prototype.warn = function() {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn.apply(null, arguments);
  }
}
  
Duplicator.prototype.err = function() {
  
  // Display an error on the console and in the error message container. Call
  // without arguments to hide the message container.
  
  var messageContainer = $('#duplicator_error');
  var messages = Array.prototype.slice.call(arguments);
  var joinedMessage = messages.join(' ').replace(/(^\s+|\s+)$/g, '');
  
  if (joinedMessage) {
    if (typeof console !== 'undefined' && console.error) {
      console.error.apply(null, messages);
    }
    
    messageContainer.text(joinedMessage).show();
    this.enableButton();
  }
  else {
    messageContainer.hide();
  }
};
